// Sistema de combate: ataque automático do jogador, aplicação de dano, mortes, loot e penalidade.
// O resultado (acerto, dano, bloqueio) é decidido aqui; a renderização apenas reage aos eventos.
import type { Element } from '../../domain/value-objects/element';
import { chebyshev } from '../../domain/value-objects/position';
import { applyDeathPenalty } from '../../domain/rules/experience';
import { applySkillDeathLoss } from '../../domain/rules/skills';
import { SKILL_IDS, SKILL_LABEL } from '../../domain/entities/definitions';
import { blockChance, distanceHitChance, mitigate, rollWandDamage, rollWeaponDamage } from '../../domain/rules/damage';
import { weaponSkillLevel } from '../../domain/rules/stats';
import { isPz, blocksSight } from '../world/GameMap';
import { lineOfSight } from '../movement/pathfinding';
import { removeOccupant, teleport } from '../movement/movement';
import type { MonsterEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { message, nextId, warnThrottled } from '../simulation/World';
import { gainExperience, refreshStats, trainPlayerSkill } from '../progression/progression';

export function hasLineOfSight(w: World, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return lineOfSight(a, b, (x, y) => blocksSight(w.map, x, y));
}

export function currentTarget(w: World): MonsterEntity | null {
  const id = w.player.targetId;
  if (!id) return null;
  const m = w.monsters.get(id);
  return m && m.alive ? m : null;
}

export function setTarget(w: World, id: string | null): void {
  const p = w.player;
  if (id) {
    const m = w.monsters.get(id);
    if (!m || !m.alive) return;
    if (isPz(w.map, p.x, p.y)) {
      warnThrottled(w, 'pz', 'Você não pode atacar dentro de uma área protegida.');
    }
  }
  if (p.targetId === id) return;
  p.targetId = id;
  p.chaseRecalcAt = 0;
  w.events.emit('targetChanged', { targetId: id });
}

/** Seleciona o monstro vivo mais próximo ao alcance (com linha de visão); retorna se encontrou. */
export function targetNearest(w: World, maxDistance: number): boolean {
  const p = w.player;
  const best = [...w.monsters.values()]
    .filter((m) => m.alive && chebyshev(m, p) <= maxDistance && !isPz(w.map, m.x, m.y) && hasLineOfSight(w, p, m))
    .sort((a, b) => chebyshev(a, p) - chebyshev(b, p) || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (best) setTarget(w, best.id);
  return !!best;
}

/** Seleciona o próximo monstro vivo mais próximo (ciclo). */
export function cycleTarget(w: World, maxDistance = 9): void {
  const p = w.player;
  const list = [...w.monsters.values()]
    .filter((m) => m.alive && chebyshev(m, p) <= maxDistance && !isPz(w.map, m.x, m.y))
    .sort((a, b) => chebyshev(a, p) - chebyshev(b, p) || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  if (!list.length) {
    warnThrottled(w, 'notarget', 'Nenhum inimigo por perto.', 800);
    return;
  }
  const idx = list.findIndex((m) => m.id === p.targetId);
  setTarget(w, list[(idx + 1) % list.length]!.id);
}

/** Alcance e linha de visão da arma atual em relação a um alvo. */
export function weaponCanReach(w: World, target: { x: number; y: number }): boolean {
  const p = w.player;
  const range = p.stats.weapon.range;
  const d = chebyshev(p, target);
  if (d > range) return false;
  return range <= 1 || hasLineOfSight(w, p, target);
}

export function updatePlayerCombat(w: World): void {
  const p = w.player;
  if (p.dead) return;
  const target = currentTarget(w);
  if (!target) {
    if (p.targetId) setTarget(w, null);
    return;
  }
  if (isPz(w.map, p.x, p.y)) return;
  if (w.now < p.nextAttackAt || !weaponCanReach(w, target)) return;
  performBasicAttack(w, target);
  p.nextAttackAt = w.now + p.stats.attackIntervalMs;
}

function performBasicAttack(w: World, target: MonsterEntity): void {
  const p = w.player;
  const c = p.character;
  const voc = w.data.vocations[c.vocation];
  const weapon = p.stats.weapon;
  const from = { x: p.x, y: p.y };
  const to = { x: target.x, y: target.y };
  // munição e mana são verificadas antes do ataque
  if (weapon.ammo) {
    const ammo = c.equipment.ammo;
    const ammoDef = ammo && w.data.items[ammo.itemId];
    if (!ammo || !ammoDef || ammoDef.ammoType !== weapon.ammo || ammo.count <= 0) {
      warnThrottled(w, 'ammo', 'Sem munição! Equipe flechas no slot de munição.', 2500);
      return;
    }
    ammo.count -= 1;
    if (ammo.count <= 0) delete c.equipment.ammo;
    w.events.emit('itemsChanged', {});
  }
  if (weapon.kind === 'wand') {
    const cost = weapon.manaCost ?? 0;
    if (c.mana < cost) {
      warnThrottled(w, 'wandmana', 'Mana insuficiente para a varinha.', 2500);
      return;
    }
    c.mana -= cost;
    trainPlayerSkill(w, 'magic', cost);
  }
  w.events.emit('attack', { sourceId: p.id, targetId: target.id, kind: weapon.kind, element: weapon.element, projectile: weapon.projectile, from, to });
  // treino: cada ataque válido contra um alvo conta uma tentativa para a skill da arma
  if (weapon.skill !== 'magic') trainPlayerSkill(w, weapon.skill, 1);
  let raw: number;
  if (weapon.kind === 'wand') {
    raw = rollWandDamage(weapon.damage ?? [4, 8], p.stats.magicLevel, voc.damage.magic, w.rng);
  } else {
    const mod = weapon.kind === 'distance' ? voc.damage.distance * (1 + p.stats.distanceDamageBonus) : voc.damage.melee;
    const skill = weaponSkillLevel(p.stats);
    if (weapon.kind === 'distance' && !w.rng.chance(distanceHitChance(skill))) {
      w.events.emit('missed', { sourceId: p.id, targetId: target.id, position: to });
      aggro(w, target);
      return;
    }
    raw = rollWeaponDamage({ level: c.level, skill, weaponAttack: weapon.attack, vocationModifier: mod }, w.rng);
  }
  const res = mitigate(raw, weapon.element, { armor: target.def.armor, resistances: target.def.resistances }, w.rng);
  damageMonster(w, target, res.damage, weapon.element, p.id);
}

export function aggro(w: World, m: MonsterEntity): void {
  if (!m.alive || w.player.dead) return;
  if (m.state !== 'chasing' && m.state !== 'attacking') {
    m.state = 'chasing';
    m.nextThinkAt = w.now;
  }
}

export function damageMonster(w: World, m: MonsterEntity, amount: number, element: Element, sourceId: string | null): void {
  if (!m.alive) return;
  const dmg = Math.max(0, Math.round(amount));
  m.hp -= dmg;
  w.events.emit('damage', { targetId: m.id, sourceId, amount: dmg, element, blocked: dmg === 0, position: { x: m.x, y: m.y } });
  if (m.hp <= 0) killMonster(w, m);
  else aggro(w, m);
}

function killMonster(w: World, m: MonsterEntity): void {
  m.alive = false;
  m.hp = 0;
  m.state = 'dead';
  m.move = null;
  m.path = null;
  m.respawnAt = w.now + m.def.respawnMs;
  removeOccupant(w, m);
  const pos = { x: m.x, y: m.y };
  w.events.emit('entityDied', { entityId: m.id, kind: 'monster', position: pos, spriteKey: m.def.sprite });
  const corpseId = nextId(w, 'corpse');
  w.corpses.set(corpseId, { id: corpseId, x: m.x, y: m.y, spriteKey: m.def.sprite, facing: m.facing, expiresAt: w.now + w.data.balance.world.corpseDecayMs });
  const loot = w.loot.roll(m.def);
  if (loot.items.length || loot.gold > 0) {
    const id = nextId(w, 'loot');
    w.lootBags.set(id, { id, x: m.x, y: m.y, items: loot.items, gold: loot.gold, expiresAt: w.now + w.data.balance.world.lootDecayMs, sourceName: m.def.name });
    w.events.emit('lootDropped', { containerId: id, position: pos });
  }
  const p = w.player;
  p.character.stats.monstersKilled += 1;
  if (p.targetId === m.id) setTarget(w, null);
  message(w, `Você derrotou: ${m.def.name} (+${m.def.experience} XP).`, 'combat');
  gainExperience(w, m.def.experience);
}

/** Dano recebido pelo jogador (de monstros). Considera bloqueio de escudo, armadura e buffs. */
export function damagePlayer(w: World, raw: number, element: Element, source: MonsterEntity): void {
  const p = w.player;
  if (p.dead || w.now < p.invulnerableUntil) return;
  const pos = { x: p.x, y: p.y };
  const hasShield = p.stats.shieldDefense > 0;
  if (element === 'physical' && hasShield) {
    const cfg = w.data.balance.combat;
    trainPlayerSkill(w, 'shielding', cfg.shieldingTriesPerHit);
    const chance = blockChance(p.stats.skills.shielding, p.stats.shieldDefense, cfg.blockChanceBase, cfg.blockChancePerSkill, cfg.maxBlockChance);
    if (w.rng.chance(chance)) {
      w.events.emit('damage', { targetId: p.id, sourceId: source.id, amount: 0, element, blocked: true, position: pos });
      return;
    }
  }
  const res = mitigate(raw, element, { armor: p.stats.armor, damageReduction: p.stats.damageReduction, physicalReduction: p.stats.physicalReduction }, w.rng);
  p.character.health = Math.max(0, p.character.health - res.damage);
  w.events.emit('damage', { targetId: p.id, sourceId: source.id, amount: res.damage, element, blocked: res.absorbed, position: pos });
  if (p.character.health <= 0) killPlayer(w, source);
}

function killPlayer(w: World, killer: MonsterEntity): void {
  const p = w.player;
  const c = p.character;
  p.dead = true;
  p.path = null;
  p.pathGoal = null;
  p.heldDir = null;
  setTarget(w, null);
  w.ui.pending = null;
  w.ui.shop = null;
  w.ui.dialog = null;
  w.ui.lootId = null;
  const before = c.experience;
  c.experience = applyDeathPenalty(c.level, c.experience, w.data.balance.player.deathXpPenalty, w.data.balance.experience);
  c.stats.deaths += 1;
  // skills também perdem treino, sem nunca ficar abaixo de 10 (Magic Level: 0)
  const voc = w.data.vocations[c.vocation];
  const lostSkills: string[] = [];
  for (const id of SKILL_IDS) {
    const before = c.skills[id].level;
    c.skills[id] = applySkillDeathLoss(id, c.skills[id], w.data.balance.player.deathSkillPenalty, voc.skillMultipliers[id], w.data.balance);
    if (c.skills[id].level < before) lostSkills.push(`${SKILL_LABEL[id]} ${before}→${c.skills[id].level}`);
  }
  refreshStats(w);
  if (lostSkills.length) message(w, `Skills perdidas: ${lostSkills.join(', ')}.`, 'warning');
  for (const m of w.monsters.values()) if (m.alive && (m.state === 'chasing' || m.state === 'attacking')) m.state = 'returning';
  w.events.emit('entityDied', { entityId: p.id, kind: 'player', position: { x: p.x, y: p.y }, spriteKey: c.vocation });
  w.events.emit('playerDied', { xpLost: before - c.experience });
  message(w, `Você foi derrotado por ${killer.def.name}.`, 'warning');
}

export function respawnPlayer(w: World): void {
  const p = w.player;
  if (!p.dead) return;
  p.dead = false;
  refreshStats(w);
  p.character.health = p.stats.maxHealth;
  p.character.mana = p.stats.maxMana;
  p.invulnerableUntil = w.now + w.data.balance.player.respawnInvulnerableMs;
  teleport(w, p, w.map.playerStart.x, w.map.playerStart.y);
  p.facing = 'down';
  w.events.emit('playerRespawned', {});
  message(w, 'Você despertou no Templo da Aurora.', 'system');
  w.events.emit('saveRequested', { reason: 'respawn' });
}
