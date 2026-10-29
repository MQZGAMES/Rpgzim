// Régua de ameaça do herói: "eu ganho essa luta?". Tudo calculado com os dados reais do jogo (armadura, bloqueio,
// dano das criaturas, poções na mochila), sem efeitos colaterais — usado para escolher onde caçar, quem puxar,
// quando beber poção e quando fugir (ainda com vida).
//
// Modelo: o herói mata as criaturas uma a uma (a mais fraca primeiro) e, enquanto cada uma vive, todas as vivas
// continuam batendo. Dano esperado = Σ tempo_para_matar(i) × dps_das_que_ainda_vivem.
// Margem = vida efetiva ÷ dano esperado. ≥ 1,6 segura · 1,0–1,6 arriscada · < 1,0 perde.
import { blockChance, maxWeaponDamage } from '../../domain/rules/damage';
import { weaponSkillLevel } from '../../domain/rules/stats';
import { chebyshev } from '../../domain/value-objects/position';
import { ROLES } from './heroRoles';
import { actorById, partyOf } from '../social/social';
import type { HeroEntity, MonsterEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';

/** Margem para considerar a luta segura / aceitável. */
export const SAFE_MARGIN = 1.6;
export const RISKY_MARGIN = 1.0;

/** Dano médio por segundo que a criatura causa ao herói (armadura, redução e bloqueio já descontados). */
export function monsterDps(w: World, h: HeroEntity, m: MonsterEntity): number {
  const a = m.def.attack;
  let avg = (a.min + a.max) / 2;
  if (a.element === 'physical') {
    avg = Math.max(0, avg - h.stats.armor * 0.75) * (1 - h.stats.physicalReduction);
    const cfg = w.data.balance.combat;
    avg *=
      1 -
      blockChance(
        h.stats.skills.shielding,
        h.stats.shieldDefense,
        cfg.blockChanceBase,
        cfg.blockChancePerSkill,
        cfg.maxBlockChance,
      );
  }
  avg *= 1 - h.stats.damageReduction;
  return Math.max(0.2, avg) / (a.intervalMs / 1000);
}

/** Maior golpe que a criatura pode dar ao herói (estoura a vida de quem está baixo). */
export function monsterMaxHit(h: HeroEntity, m: MonsterEntity): number {
  const a = m.def.attack;
  let max = a.max;
  if (a.element === 'physical')
    max = Math.max(0, max - h.stats.armor * 0.5) * (1 - h.stats.physicalReduction);
  return max * (1 - h.stats.damageReduction);
}

/** Dano médio por segundo do personagem contra esta criatura (armadura e resistência dela descontadas). */
export function heroDpsVs(w: World, h: PlayerEntity, m: MonsterEntity): number {
  const voc = w.data.vocations[h.character.vocation];
  const weapon = h.stats.weapon;
  let avg: number;
  if (weapon.kind === 'wand')
    avg = ((weapon.damage?.[0] ?? 4) + (weapon.damage?.[1] ?? 8)) / 2 + h.stats.magicLevel * 0.5;
  else {
    const mod =
      weapon.kind === 'distance' ? voc.damage.distance * (1 + h.stats.distanceDamageBonus) : voc.damage.melee;
    const max = maxWeaponDamage({
      level: h.character.level,
      skill: weaponSkillLevel(h.stats),
      weaponAttack: weapon.attack,
      vocationModifier: mod,
    });
    avg = max * 0.675; // o golpe rola entre 35% e 100% do máximo
  }
  if (weapon.element === 'physical') avg = Math.max(1, avg - m.def.armor * 0.75);
  const res = m.def.resistances?.[weapon.element];
  if (res !== undefined) avg *= res;
  // sem arma nas mãos os feitiços fazem o dano (a magia vale sem arma): estimativa pela fórmula das magias básicas
  if (!h.character.equipment.mainHand && h.character.vocation !== 'knight')
    avg = Math.max(avg, (10 + h.character.level * 0.4 + h.stats.magicLevel * 1.8) * 0.9);
  // magias de ataque somam um pouco mais que o golpe básico
  return Math.max(0.5, avg * 1.12 * ROLES[h.character.vocation].dpsMul) / (h.stats.attackIntervalMs / 1000);
}

/** Poções de vida na mochila (cura de cada uma, da maior para a menor, uma entrada por poção). */
export function healPotions(w: World, h: HeroEntity): number[] {
  const out: number[] = [];
  for (const st of h.character.inventory) {
    const use = st && w.data.items[st.itemId]?.use;
    if (st && use?.heal && !use.mana) for (let i = 0; i < Math.min(st.count, 12); i++) out.push(use.heal);
  }
  return out.sort((a, b) => b - a);
}

/** Vida efetiva: vida atual + 70% da cura de até 5 poções (cada uma tem exaustão de 2 a 8 s conforme a força). */
export function effectiveHp(w: World, h: HeroEntity): number {
  const pots = healPotions(w, h)
    .slice(0, 5)
    .reduce((s, v) => s + v, 0);
  // Escudo de Mana ativo: a mana também absorve dano (a vida só cai quando ela acaba)
  const shield = h.buffs.some((b) => b.kind === 'manaShield') ? h.character.mana : 0;
  return h.character.health + 0.7 * pots + shield;
}

/** Colegas de grupo vivos a até 10 tiles (lutam junto). */
export function alliesAround(w: World, h: PlayerEntity): PlayerEntity[] {
  const p = partyOf(w, h.id);
  if (!p) return [];
  const out: PlayerEntity[] = [];
  for (const id of p.members) {
    const a = actorById(w, id);
    if (a && a !== h && !a.dead && chebyshev(a, h) <= 10) out.push(a);
  }
  return out;
}

/** Dano por segundo do grupo (ele + colegas por perto) contra a criatura: com mais gente ela morre mais rápido. */
export function partyDpsVs(w: World, h: HeroEntity, m: MonsterEntity, allies = alliesAround(w, h)): number {
  return allies.reduce((s, a) => s + heroDpsVs(w, a, m) * 0.85, heroDpsVs(w, h, m));
}

/**
 * Quanto do dano das criaturas cai nele no grupo: o Knight segura quase tudo; os demais, com um Knight junto, pouco;
 * sem tanque, o dano se espalha entre os membros.
 */
export function damageShare(w: World, h: HeroEntity, allies = alliesAround(w, h)): number {
  if (!allies.length) return 1;
  const knightMate = allies.some((a) => a.character.vocation === 'knight');
  if (h.character.vocation === 'knight') return 0.8;
  if (knightMate) return 0.3;
  return Math.max(0.35, 1 / (1 + allies.length * 0.7));
}

/** Dano total esperado e duração (s) da luta contra o grupo (mata a mais fraca primeiro), com a ajuda dos colegas. */
export function fightPlan(
  w: World,
  h: HeroEntity,
  mons: readonly MonsterEntity[],
): { damage: number; seconds: number } {
  const allies = alliesAround(w, h);
  const share = damageShare(w, h, allies);
  const rows = mons.map((m) => {
    const out = partyDpsVs(w, h, m, allies) * (m.def.attack.range > 2 ? 0.8 : 1); // atiradores fogem/recuam: demora mais
    return { hp: m.hp, dpsIn: monsterDps(w, h, m) * share, ttk: m.hp / out };
  });
  rows.sort((a, b) => a.ttk - b.ttk);
  let incoming = rows.reduce((s, r) => s + r.dpsIn, 0);
  let damage = 0;
  let seconds = 0;
  for (const r of rows) {
    damage += r.ttk * incoming;
    seconds += r.ttk;
    incoming -= r.dpsIn;
  }
  return { damage, seconds };
}

export function expectedDamage(w: World, h: HeroEntity, mons: readonly MonsterEntity[]): number {
  return fightPlan(w, h, mons).damage;
}

/**
 * Vida que ele consegue gastar numa luta de `seconds`: a vida atual, o Escudo de Mana e a cura que dá para beber no
 * tempo da luta (a melhor poção, no ritmo da exaustão dela, até acabar o estoque) — antes só contava 5 poções, e
 * uma caça longa e tranquila de poção em poção parecia perigosa. Magos ainda curam um pouco com a magia.
 */
export function sustainHp(w: World, h: HeroEntity, seconds: number): number {
  let stock = 0;
  let rate = 0;
  for (const st of h.character.inventory) {
    const use = st && w.data.items[st.itemId]?.use;
    if (!st || !use?.heal || use.mana) continue;
    stock += use.heal * st.count;
    rate = Math.max(rate, use.heal / (Math.max(1000, use.cooldownMs ?? 2000) / 1000));
  }
  const top5 = healPotions(w, h)
    .slice(0, 5)
    .reduce((s, v) => s + v, 0);
  const drink = Math.max(top5, Math.min(stock, rate * seconds)) * 0.7;
  const shield = h.buffs.some((b) => b.kind === 'manaShield') ? h.character.mana : 0;
  const voc = h.character.vocation;
  const spell =
    voc === 'druid' || voc === 'sorcerer'
      ? Math.min(
          (h.character.mana / 20) * (22 + h.character.level * 0.6 + h.stats.magicLevel * 2),
          ((22 + h.character.level * 0.6 + h.stats.magicLevel * 2) / 2) * seconds,
        ) * (voc === 'druid' ? 0.35 : 0.2)
      : 0;
  return h.character.health + drink + shield + spell;
}

/** Margem da luta (vida que dá para gastar ÷ dano esperado); Infinity sem criaturas. */
export function fightMargin(w: World, h: HeroEntity, mons: readonly MonsterEntity[]): number {
  if (!mons.length) return Infinity;
  const { damage, seconds } = fightPlan(w, h, mons);
  // os colegas também curam e puxam a atenção quando a coisa aperta: uma folga pequena por colega
  const allies = alliesAround(w, h).length;
  return (sustainHp(w, h, seconds) / Math.max(1, damage)) * (1 + 0.1 * allies);
}

/** Quantos colegas de grupo vivos estão por perto. */
export function alliesNear(w: World, h: HeroEntity): number {
  return alliesAround(w, h).length;
}

/** Criaturas vivas a até `radius` tiles do ponto (fora da área protegida). */
export function monstersNear(
  w: World,
  at: { x: number; y: number },
  radius: number,
  except?: MonsterEntity,
): MonsterEntity[] {
  return [...w.monsters.values()].filter((m) => m.alive && m !== except && chebyshev(m, at) <= radius);
}

/** Quem já está brigando com o herói ou entraria na briga (perseguindo-o, ou perto o bastante para notá-lo). */
export function engagedOrJoining(w: World, h: HeroEntity): MonsterEntity[] {
  return [...w.monsters.values()].filter((m) => {
    if (!m.alive) return false;
    const d = chebyshev(m, h);
    if (m.targetId === h.id && (m.state === 'chasing' || m.state === 'attacking') && d <= 12) return true;
    return d <= Math.min(7, m.def.aggroRadius) && m.state !== 'returning';
  });
}

/** Resumo para a tomada de decisão: quem está na briga, o dano por segundo e quanto tempo de vida resta. */
export interface Assessment {
  mons: MonsterEntity[];
  /** Dano por segundo que está chegando agora. */
  dps: number;
  /** Maior golpe possível entre as criaturas. */
  maxHit: number;
  /** Segundos de vida no ritmo atual (sem contar poções). */
  secondsLeft: number;
  margin: number;
}

export function assess(w: World, h: HeroEntity, extra: readonly MonsterEntity[] = []): Assessment {
  const set = new Set<MonsterEntity>([...engagedOrJoining(w, h), ...extra]);
  const mons = [...set];
  const dps = mons.reduce((s, m) => s + monsterDps(w, h, m), 0);
  const maxHit = mons.reduce((mx, m) => Math.max(mx, monsterMaxHit(h, m)), 0);
  return {
    mons,
    dps,
    maxHit,
    secondsLeft: dps > 0 ? h.character.health / dps : Infinity,
    margin: fightMargin(w, h, mons),
  };
}

/**
 * XP por minuto de caçar esta espécie, pelo tempo que o herói leva para matar cada criatura (dano dele contra a
 * vida e a armadura dela) mais ~4 s de procurar e chegar até a próxima. É o que decide "onde rende mais".
 */
export function xpPerMinute(w: World, h: HeroEntity, id: string): number {
  const def = w.data.monsters[id];
  if (!def) return 0;
  const proto = { def, hp: def.health } as unknown as MonsterEntity;
  // em grupo: o dano de todos mata mais rápido, mas a XP (com o bônus de vocações diferentes) é dividida
  const allies = alliesAround(w, h);
  const dps = partyDpsVs(w, h, proto, allies) * (def.attack.range > 2 ? 0.8 : 1);
  const cycle = def.health / Math.max(0.5, dps) + 4 + (def.behavior === 'skirmisher' ? 2 : 0);
  const variety = new Set([h, ...allies].map((a) => a.character.vocation)).size;
  const share = allies.length ? (1 + 0.25 * (variety - 1)) / (allies.length + 1) : 1;
  return (def.experience * share / cycle) * 60;
}
