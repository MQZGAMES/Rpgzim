// Conjuração de magias: valida requisitos, consome mana/munição, inicia cooldowns, treina Magic Level
// e aplica o efeito pelas regras centrais. Os efeitos visuais são apenas consequência do evento spellCast.
import type { SpellDef } from '../../domain/entities/definitions';
import { chebyshev, type TilePos } from '../../domain/value-objects/position';
import { GLOBAL_SPELL, remaining, startCooldown } from '../../domain/rules/cooldowns';
import { mitigate, rollRange, spellRange } from '../../domain/rules/damage';
import { castFailMessage, validateCast } from '../../domain/rules/spells';
import { isPz, isSolid } from '../world/GameMap';
import type { MonsterEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { asActor, warnThrottled } from '../simulation/World';
import { actorSource, aggro, currentActorTarget, currentTarget, damageMonster, damagePlayer, hasLineOfSight, targetNearest } from '../combat/combat';
import { actorById, canAttackActor, partyOf, registerAggression } from '../social/social';
import { refreshStats, trainPlayerSkill } from '../progression/progression';

export function spellCooldownRemaining(w: World, spellId: string): number {
  return Math.max(remaining(w.player.cooldowns, `spell:${spellId}`, w.now), remaining(w.player.cooldowns, GLOBAL_SPELL, w.now));
}

/** Contexto de validação a partir do estado atual (também usado pela interface para mostrar disponibilidade). */
export function castCheck(w: World, spell: SpellDef) {
  const p = w.player;
  const c = p.character;
  const t = currentTarget(w) ?? currentActorTarget(w);
  const ammo = c.equipment.ammo;
  return validateCast(spell, {
    vocation: c.vocation,
    level: c.level,
    magicLevel: p.stats.magicLevel,
    mana: c.mana,
    dead: p.dead,
    cooldownRemaining: remaining(p.cooldowns, `spell:${spell.id}`, w.now),
    globalCooldownRemaining: remaining(p.cooldowns, GLOBAL_SPELL, w.now),
    inProtectionZone: isPz(w.map, p.x, p.y),
    target: t ? { exists: true, alive: t.kind === 'monster' ? t.alive : !t.dead, hostile: t.kind === 'monster' || !canAttackActor(w, p, t), distance: chebyshev(p, t), lineOfSight: hasLineOfSight(w, p, t) } : null,
    ammoCount: ammo && w.data.items[ammo.itemId]?.ammoType === 'arrow' ? ammo.count : 0,
    weaponKind: p.stats.weapon.kind,
  });
}

function areaTiles(w: World, center: TilePos, radius: number): TilePos[] {
  const out: TilePos[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.hypot(dx, dy) > radius + 0.5) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (isSolid(w.map, x, y) && !(dx === 0 && dy === 0)) continue;
      if (!hasLineOfSight(w, center, { x, y })) continue;
      out.push({ x, y });
    }
  return out;
}

export function castSpell(w: World, spellId: string): boolean {
  const spell = w.data.spells[spellId];
  if (!spell) return false;
  const p = w.player;
  const c = p.character;
  // magia ofensiva com alvo e sem alvo selecionado: mira automaticamente o inimigo mais próximo
  // (golpes corpo a corpo também: mira o mais próximo por perto e o golpe sai ao chegar nele)
  if (spell.effect === 'damage' && (spell.target === 'target' || spell.target === 'areaTarget') && !currentTarget(w) && !currentActorTarget(w) && !p.dead) {
    targetNearest(w, Math.max(spell.range, 7));
  }
  const check = castCheck(w, spell);
  if (!check.ok && check.reason === 'outOfRange') {
    // fica na fila: é lançada assim que o alvo entrar no alcance (seguindo o alvo)
    p.queuedSpell = { id: spell.id, until: w.now + 4000 };
    warnThrottled(w, `queue:${spell.id}`, `${spell.name}: assim que o alvo estiver ao alcance.`, 2000);
    return false;
  }
  if (!check.ok) {
    warnThrottled(w, `cast:${check.reason}`, castFailMessage(check.reason, check.detail), 600);
    return false;
  }
  const voc = w.data.vocations[c.vocation];
  p.queuedSpell = null;
  // custo, cooldowns e treino de Magic Level (mana gasta)
  c.mana -= spell.manaCost;
  startCooldown(p.cooldowns, `spell:${spell.id}`, w.now, spell.cooldownMs);
  startCooldown(p.cooldowns, GLOBAL_SPELL, w.now, w.data.balance.combat.globalSpellCooldownMs);
  trainPlayerSkill(w, 'magic', spell.manaCost);
  if (spell.ammoCost && c.equipment.ammo) {
    c.equipment.ammo.count -= spell.ammoCost;
    if (c.equipment.ammo.count <= 0) delete c.equipment.ammo;
    w.events.emit('itemsChanged', {});
  }

  const target = currentTarget(w);
  const actorTarget = target ? null : currentActorTarget(w);
  let tiles: TilePos[] = [];
  let victims: MonsterEntity[] = [];
  if (spell.target === 'target' && target) {
    tiles = [{ x: target.x, y: target.y }];
    victims = [target];
  } else if (spell.target === 'areaTarget' && (target || actorTarget)) {
    tiles = areaTiles(w, (target ?? actorTarget)!, spell.radius ?? 1);
    victims = monstersOn(w, tiles);
  } else if (spell.target === 'target' && actorTarget) {
    tiles = [{ x: actorTarget.x, y: actorTarget.y }];
  } else if (spell.target === 'areaSelf') {
    tiles = areaTiles(w, p, spell.radius ?? 1).filter((t) => t.x !== p.x || t.y !== p.y);
    victims = monstersOn(w, tiles);
  } else {
    tiles = [{ x: p.x, y: p.y }];
  }
  const aim = target ?? actorTarget;
  if (aim && (spell.target === 'target' || spell.target === 'areaTarget')) {
    p.facing = Math.abs(aim.x - p.x) >= Math.abs(aim.y - p.y) ? (aim.x < p.x ? 'left' : 'right') : aim.y < p.y ? 'up' : 'down';
  }
  w.events.emit('spellCast', { casterId: p.id, spellId: spell.id, words: spell.words, from: { x: p.x, y: p.y }, targetId: aim?.id ?? null, tiles });

  if (spell.effect === 'damage' && victims.length) p.lastAttackAt = w.now;
  if (spell.effect === 'damage' && spell.formula) {
    const power = spell.formula.kind === 'magic' ? p.stats.magicLevel : spell.formula.kind === 'distance' ? p.stats.skills.distance : p.stats.skills[p.stats.weapon.skill === 'magic' ? 'club' : p.stats.weapon.skill];
    const mod = spell.formula.kind === 'magic' ? voc.damage.magic : spell.formula.kind === 'distance' ? voc.damage.distance : voc.damage.melee;
    const range = spellRange(spell.formula, { level: c.level, power, weaponAttack: p.stats.weapon.attack }, mod);
    for (const m of victims) {
      const raw = rollRange(range, w.rng);
      const res = mitigate(raw, spell.element, { armor: m.def.armor, resistances: m.def.resistances }, w.rng);
      if (spell.slow) {
        m.slowUntil = w.now + spell.slow.durationMs;
        m.slowFactor = spell.slow.factor;
      }
      damageMonster(w, m, res.damage, spell.element, p.id);
      // golpe em área com isca: o monstro atingido vira as costas para quem atacava e persegue o conjurador
      aggro(w, m, spell.attract ? p.id : undefined);
    }
    // PK: o personagem mirado também é atingido (se estiver na área do efeito)
    if (actorTarget && tiles.some((t) => t.x === actorTarget.x && t.y === actorTarget.y) && !canAttackActor(w, p, actorTarget)) {
      registerAggression(w, p.id, actorTarget.id);
      const raw = rollRange(range, w.rng);
      const src = actorSource(p);
      asActor(w, actorTarget, () => damagePlayer(w, raw, spell.element, src));
    }
  } else if (spell.effect === 'heal' && spell.formula) {
    const range = spellRange(spell.formula, { level: c.level, power: p.stats.magicLevel, weaponAttack: 0 }, voc.damage.healing);
    const amount = rollRange(range, w.rng);
    const before = c.health;
    c.health = Math.min(p.stats.maxHealth, c.health + amount);
    w.events.emit('heal', { targetId: p.id, amount: c.health - before, mana: false, position: { x: p.x, y: p.y } });
    // em grupo: cura (e abençoa) os membros por perto
    if (spell.partyRadius) {
      for (const id of partyOf(w, p.id)?.members ?? []) {
        if (id === p.id) continue;
        const m = actorById(w, id);
        if (!m || m.dead || chebyshev(m, p) > spell.partyRadius) continue;
        const healed = rollRange(range, w.rng);
        asActor(w, m, () => {
          const b0 = m.character.health;
          m.character.health = Math.min(m.stats.maxHealth, m.character.health + healed);
          w.events.emit('heal', { targetId: m.id, amount: m.character.health - b0, mana: false, position: { x: m.x, y: m.y } });
          if (spell.buff) {
            m.buffs = m.buffs.filter((b) => b.kind !== spell.buff!.kind);
            m.buffs.push({ kind: spell.buff.kind, value: spell.buff.value, expiresAt: w.now + spell.buff.durationMs, sourceSpell: spell.id });
            refreshStats(w);
            w.events.emit('buffApplied', { targetId: m.id, kind: spell.buff.kind, durationMs: spell.buff.durationMs });
          }
        });
      }
    }
  }
  if (spell.buff) {
    p.buffs = p.buffs.filter((b) => b.kind !== spell.buff!.kind);
    p.buffs.push({ kind: spell.buff.kind, value: spell.buff.value, expiresAt: w.now + spell.buff.durationMs, sourceSpell: spell.id });
    refreshStats(w);
    w.events.emit('buffApplied', { targetId: p.id, kind: spell.buff.kind, durationMs: spell.buff.durationMs });
  }
  return true;
}

function monstersOn(w: World, tiles: TilePos[]): MonsterEntity[] {
  const set = new Set(tiles.map((t) => t.y * w.map.width + t.x));
  return [...w.monsters.values()].filter((m) => m.alive && set.has(m.y * w.map.width + m.x));
}

/** Magia na fila (alvo fora do alcance): lança quando der, ou desiste depois de alguns segundos. */
export function updateQueuedSpell(w: World): void {
  const p = w.player;
  const q = p.queuedSpell;
  if (!q) return;
  const spell = w.data.spells[q.id];
  if (!spell || w.now > q.until || p.dead || (!currentTarget(w) && !currentActorTarget(w))) {
    p.queuedSpell = null;
    return;
  }
  if (castCheck(w, spell).ok) castSpell(w, q.id);
}
