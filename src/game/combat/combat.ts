// Sistema de combate: ataque automático do jogador, aplicação de dano, mortes, loot e penalidade.
// O resultado (acerto, dano, bloqueio) é decidido aqui; a renderização apenas reage aos eventos.
import { EQUIP_SLOTS } from '../../domain/entities/definitions';
import type { Element } from '../../domain/value-objects/element';
import { chebyshev } from '../../domain/value-objects/position';
import { applyDeathPenalty } from '../../domain/rules/experience';
import { applySkillDeathLoss } from '../../domain/rules/skills';
import { SKILL_IDS, SKILL_LABEL } from '../../domain/entities/definitions';
import { blockChance, distanceHitChance, mitigate, rollRange, rollWandDamage, rollWeaponDamage } from '../../domain/rules/damage';
import { weaponSkillLevel } from '../../domain/rules/stats';
import { shieldingTryCounts } from '../../domain/rules/shielding';
import { isPz, blocksSight } from '../world/GameMap';
import { lineOfSight } from '../movement/pathfinding';
import { removeOccupant, teleport } from '../movement/movement';
import { freeCellNear } from '../movement/walk';
import type { MonsterEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { asActor, message, nextId, warnThrottled } from '../simulation/World';
import { PVP_FAIL_MESSAGE, actorById, canAttackActor, isSparring, killCredit, onPlayerDeath, recordDamage, registerAggression, registerPlayerKill, skullOf, touchCombat, xpReceivers } from '../social/social';
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

/** Personagem (jogador ou herói) mirado pelo ator em execução, se for o caso (PK). */
export function currentActorTarget(w: World): PlayerEntity | null {
  const a = actorById(w, w.player.targetId);
  return a && !a.dead ? a : null;
}

/** Quem causou o dano (monstro ou personagem), com nome para as mensagens de morte. */
export interface DamageSource {
  id: string;
  name: string;
  kind: 'monster' | 'player';
}
export const monsterSource = (m: MonsterEntity): DamageSource => ({ id: m.id, name: m.def.name, kind: 'monster' });
export const actorSource = (a: PlayerEntity): DamageSource => ({ id: a.id, name: a.character.name, kind: 'player' });

export function setTarget(w: World, id: string | null): void {
  const p = w.player;
  if (id) {
    const m = w.monsters.get(id);
    const a = m ? null : actorById(w, id);
    if (a) {
      const fail = canAttackActor(w, p, a);
      if (fail) {
        warnThrottled(w, `pvp:${fail}`, PVP_FAIL_MESSAGE[fail], 800);
        return;
      }
    } else if (!m || !m.alive) return;
    if (isPz(w.map, p.x, p.y)) {
      warnThrottled(w, 'pz', 'Você não pode atacar dentro de uma área protegida.');
    }
  }
  if (id) p.chasePaused = false; // escolher (ou reescolher) o alvo volta a persegui-lo
  if (p.targetId === id) return;
  p.targetId = id;
  p.chaseRecalcAt = 0;
  p.chasePath = null;
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
  const target: MonsterEntity | PlayerEntity | null = currentTarget(w) ?? currentActorTarget(w);
  if (!target) {
    if (p.targetId) setTarget(w, null);
    return;
  }
  if (target.kind === 'player' && canAttackActor(w, p, target)) {
    // PK desligado, alvo entrou na área protegida ou virou membro do grupo: para de atacar
    setTarget(w, null);
    return;
  }
  if (isPz(w.map, p.x, p.y)) return;
  if (w.now < p.nextAttackAt || !weaponCanReach(w, target)) return;
  performBasicAttack(w, target);
  p.nextAttackAt = w.now + p.stats.attackIntervalMs;
}

/** Aplica um golpe já rolado no alvo (monstro: armadura/resistências; personagem: escudo/armadura/buffs). */
function applyHit(w: World, target: MonsterEntity | PlayerEntity, raw: number, element: Element, fixed: boolean): void {
  const p = w.player;
  if (target.kind === 'monster') {
    const dmg = fixed ? raw : mitigate(raw, element, { armor: target.def.armor, resistances: target.def.resistances }, w.rng).damage;
    damageMonster(w, target, dmg, element, p.id);
    return;
  }
  registerAggression(w, p.id, target.id);
  const src = actorSource(p);
  asActor(w, target, () => damagePlayer(w, raw, element, src, fixed));
}

function performBasicAttack(w: World, target: MonsterEntity | PlayerEntity): void {
  const p = w.player;
  const c = p.character;
  const voc = w.data.vocations[c.vocation];
  const weapon = p.stats.weapon;
  const from = { x: p.x, y: p.y };
  const to = { x: target.x, y: target.y };
  // a mana é verificada antes do ataque
  if (weapon.kind === 'wand') {
    const cost = weapon.manaCost ?? 0;
    if (c.mana < cost) {
      warnThrottled(w, 'wandmana', 'Mana insuficiente para a varinha.', 2500);
      return;
    }
    c.mana -= cost;
    trainPlayerSkill(w, 'magic', cost);
  }
  p.lastAttackAt = w.now;
  w.events.emit('attack', { sourceId: p.id, targetId: target.id, kind: weapon.kind, element: weapon.element, projectile: weapon.projectile, from, to });
  // treino: cada ataque válido contra um alvo conta uma tentativa para a skill da arma
  if (weapon.skill !== 'magic') trainPlayerSkill(w, weapon.skill, 1);
  if (weapon.training && weapon.damage) {
    // arma de treino: dano fixo baixo, sem armadura nem errar — o foco é treinar a skill
    applyHit(w, target, rollRange(weapon.damage as [number, number], w.rng), weapon.element, true);
    return;
  }
  let raw: number;
  if (weapon.kind === 'wand') {
    raw = rollWandDamage(weapon.damage ?? [4, 8], p.stats.magicLevel, voc.damage.magic, w.rng);
  } else {
    const cfg = w.data.balance.combat;
    const pointBlank = weapon.kind === 'distance' && chebyshev(p, target) <= 1;
    if (pointBlank) warnThrottled(w, 'pointblank', 'Muito perto para atirar bem: afaste-se pelo menos 2 tiles.', 6000);
    const mod = (weapon.kind === 'distance' ? voc.damage.distance * (1 + p.stats.distanceDamageBonus) : voc.damage.melee) * (pointBlank ? cfg.pointBlankDamageMultiplier : 1);
    const skill = weaponSkillLevel(p.stats);
    if (weapon.kind === 'distance' && !w.rng.chance(distanceHitChance(skill) * (pointBlank ? cfg.pointBlankHitMultiplier : 1))) {
      w.events.emit('missed', { sourceId: p.id, targetId: target.id, position: to });
      if (target.kind === 'monster') aggro(w, target);
      else registerAggression(w, p.id, target.id);
      return;
    }
    raw = rollWeaponDamage({ level: c.level, skill, weaponAttack: weapon.attack, vocationModifier: mod }, w.rng);
  }
  applyHit(w, target, raw, weapon.element, false);
}

/**
 * O monstro passa a perseguir quem o atacou.
 * Sem `attractor`, o monstro já perseguindo alguém não é roubado (o alvo mais próximo continua valendo).
 * Com `attractor` (ex.: golpe em área do Knight), o monstro vira as costas para quem estava atacando
 * e persegue quem o atraiu — é o "puxar a atenção" do Knight.
 */
export function aggro(w: World, m: MonsterEntity, attractor?: string): void {
  if (!m.alive) return;
  const id = attractor ?? w.player.id;
  const actor = attractor ? actorById(w, attractor) : w.player;
  if (!actor || actor.dead) return;
  const chasing = m.state === 'chasing' || m.state === 'attacking';
  if (chasing && m.targetId === id) return;
  // sem isca explícita, quem já persegue alguém continua com o alvo atual
  if (chasing && attractor === undefined && m.targetId) return;
  if (!chasing) {
    m.state = 'chasing';
    m.nextThinkAt = w.now;
  }
  m.targetId = id;
  // a isca prende o monstro no conjurador por um tempo: o "inimigo mais próximo" não rouba o foco
  if (attractor) m.tauntUntil = w.now + TAUNT_MS;
}

/** Quanto tempo o monstro fica preso no alvo atraído (isca do Knight). */
export const TAUNT_MS = 4000;

export function damageMonster(w: World, m: MonsterEntity, amount: number, element: Element, sourceId: string | null): void {
  if (!m.alive) return;
  if (sourceId && actorById(w, sourceId)) touchCombat(w, sourceId); // lutar renova a caveira que está acabando
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
  // XP: sozinho fica com tudo; em grupo, dividida igualmente entre os membros vivos e próximos
  const receivers = xpReceivers(w, p.id, pos);
  if (receivers.length <= 1) {
    message(w, `Você derrotou: ${m.def.name} (+${m.def.experience} XP).`, 'combat');
    gainExperience(w, m.def.experience);
    return;
  }
  // bônus de variedade: cada vocação diferente no grupo soma 25% à XP total (que então é dividida)
  const variety = new Set(receivers.map((r) => r.character.vocation)).size;
  const total = Math.round(m.def.experience * (1 + 0.25 * (variety - 1)));
  const share = Math.max(1, Math.floor(total / receivers.length));
  message(w, `Você derrotou: ${m.def.name}.`, 'combat');
  for (const r of receivers)
    asActor(w, r, () => {
      message(w, `+${share} XP (grupo: ${total} ÷ ${receivers.length}).`, 'combat');
      gainExperience(w, share);
    });
}

/** Dano recebido pelo personagem em execução (de monstros ou de outro personagem, no PK).
 * Considera bloqueio de escudo, armadura e buffs; `fixed` ignora a armadura (armas de treino). */
export function damagePlayer(w: World, raw: number, element: Element, source: DamageSource, fixed = false): void {
  const p = w.player;
  if (p.dead || w.now < p.invulnerableUntil) return;
  touchCombat(w, p.id); // ser atacado (por personagem, NPC ou criatura) renova a caveira que está acabando
  const pos = { x: p.x, y: p.y };
  const hasShield = p.stats.shieldDefense > 0;
  const cfg = w.data.balance.combat;
  // treino (qualquer elemento): até 2 atacantes por janela e só se o jogador estiver lutando
  if (shieldingTryCounts(p.shieldTraining, w.now, source.id, hasShield, p.lastAttackAt, cfg)) trainPlayerSkill(w, 'shielding', cfg.shieldingTriesPerHit);
  if (element === 'physical' && hasShield) {
    const chance = blockChance(p.stats.skills.shielding, p.stats.shieldDefense, cfg.blockChanceBase, cfg.blockChancePerSkill, cfg.maxBlockChance);
    if (w.rng.chance(chance)) {
      w.events.emit('damage', { targetId: p.id, sourceId: source.id, amount: 0, element, blocked: true, position: pos });
      return;
    }
  }
  const res = fixed ? { damage: Math.round(raw), absorbed: raw <= 0 } : mitigate(raw, element, { armor: p.stats.armor, damageReduction: p.stats.damageReduction, physicalReduction: p.stats.physicalReduction }, w.rng);
  // Escudo de Mana: o dano sai da mana primeiro; o que passar (mana zerada) atinge a vida
  let toHealth = res.damage;
  if (toHealth > 0 && p.buffs.some((b) => b.kind === 'manaShield' && b.expiresAt > w.now) && p.character.mana > 0) {
    const absorbed = Math.min(toHealth, p.character.mana);
    p.character.mana -= absorbed;
    toHealth -= absorbed;
  }
  recordDamage(w, p.id, source.id, res.damage); // de quem veio o dano (decide quem matou)
  const manaLoss = res.damage - toHealth;
  p.character.health = Math.max(0, p.character.health - toHealth);
  w.events.emit('damage', { targetId: p.id, sourceId: source.id, amount: toHealth, ...(manaLoss > 0 ? { manaLoss } : {}), element, blocked: res.absorbed && manaLoss === 0, position: pos });
  if (p.character.health <= 0) killPlayer(w, source);
}

function killPlayer(w: World, killer: DamageSource): void {
  const p = w.player;
  const c = p.character;
  const skullBefore = skullOf(w, p.id)?.kind ?? null;
  p.dead = true;
  p.path = null;
  p.pathGoal = null;
  p.heldDir = null;
  setTarget(w, null);
  w.ui.pending = null;
  w.ui.shop = null;
  w.ui.depot = null;
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
  for (const m of w.monsters.values())
    if (m.alive && m.targetId === p.id && (m.state === 'chasing' || m.state === 'attacking')) {
      m.state = 'returning';
      m.targetId = null;
    }
  w.events.emit('entityDied', { entityId: p.id, kind: 'player', position: { x: p.x, y: p.y }, spriteKey: c.vocation });
  w.events.emit('playerDied', { xpLost: before - c.experience, killerId: killer.id, killerName: killer.name, byPlayer: killer.kind === 'player' });
  message(w, `Você foi derrotado por ${killer.name}.`, 'warning');
  const sparring = killer.kind === 'player' && isSparring(w, killer.id, p.id);
  // a morte conta para quem deu o MAIOR dano e o ÚLTIMO golpe, e só se for personagem: se uma criatura causou mais
  // dano (ou deu o golpe final), quem matou foi a criatura e ninguém pega morte injusta
  if (!sparring) {
    const killerId = killCredit(w, p.id, killer.kind === 'player' ? killer.id : null);
    if (killerId && killerId !== p.id) registerPlayerKill(w, killerId, skullBefore, c.name);
  }
  onPlayerDeath(w, p.id);
  if (!sparring) dropDeathLoot(w, p, skullBefore === 'red');
}

/**
 * Perdas da morte: TODA a mochila e o dinheiro da bolsa caem num saco no chão (qualquer um pode pegar e ele só
 * some quando alguém pegar); cada item equipado tem 10% de chance de cair (caveira vermelha perde todos).
 * O Amuleto da Perda protege tudo — e se desfaz.
 */
function dropDeathLoot(w: World, victim: PlayerEntity, redSkull: boolean): void {
  const c = victim.character;
  const amulet = c.equipment.amulet;
  if (amulet && w.data.items[amulet.itemId]?.protectsOnDeath) {
    delete c.equipment.amulet;
    refreshStats(w);
    message(w, 'Seu Amuleto da Perda se desfez e protegeu seus itens e seu dinheiro!', 'system');
    w.events.emit('itemsChanged', {});
    return;
  }
  const items: { itemId: string; count: number }[] = [];
  for (let i = 0; i < c.inventory.length; i++) {
    const st = c.inventory[i];
    if (st) items.push({ ...st });
    c.inventory[i] = null;
  }
  const gold = c.gold;
  c.gold = 0;
  const lostEquip: string[] = [];
  for (const slot of EQUIP_SLOTS) {
    const st = c.equipment[slot];
    if (!st) continue;
    if (redSkull || w.rng.chance(0.1)) {
      items.push({ ...st });
      lostEquip.push(w.data.items[st.itemId]?.name ?? st.itemId);
      delete c.equipment[slot];
    }
  }
  refreshStats(w);
  if (!items.length && !gold) return;
  const id = nextId(w, 'loot');
  w.lootBags.set(id, { id, ownerId: victim.id, x: victim.x, y: victim.y, items, gold, expiresAt: Infinity, sourceName: `${c.name} (morto)` });
  w.events.emit('lootDropped', { containerId: id, position: { x: victim.x, y: victim.y } });
  w.events.emit('itemsChanged', {});
  message(w, `Você perdeu tudo da mochila e ${gold} de ouro: está no chão onde você caiu (qualquer um pode pegar).`, 'warning');
  if (lostEquip.length) message(w, `Também caiu equipamento: ${lostEquip.join(', ')}.`, 'warning');
}

export function respawnPlayer(w: World): void {
  const p = w.player;
  if (!p.dead) return;
  p.dead = false;
  refreshStats(w);
  p.character.health = p.stats.maxHealth;
  p.character.mana = p.stats.maxMana;
  p.invulnerableUntil = w.now + w.data.balance.player.respawnInvulnerableMs;
  const spot = freeCellNear(w, w.map.playerStart.x, w.map.playerStart.y, p.id);
  teleport(w, p, spot.x, spot.y);
  p.facing = 'down';
  w.events.emit('playerRespawned', {});
  message(w, 'Você despertou no Templo da Aurora.', 'system');
  w.events.emit('saveRequested', { reason: 'respawn' });
}
