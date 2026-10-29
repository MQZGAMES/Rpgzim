// Regras centrais de dano e cura. A animação nunca decide o resultado: estas funções decidem
// e a renderização apenas representa o que foi calculado.
import type { Rng } from '../value-objects/rng';
import type { Element } from '../value-objects/element';
import type { SpellFormula } from '../entities/definitions';

export interface AttackPower {
  level: number;
  /** Skill da arma (ou Magic Level, para varinhas). */
  skill: number;
  weaponAttack: number;
  /** Modificador da vocação para a categoria. */
  vocationModifier: number;
}

/** Dano máximo de um golpe corpo a corpo ou à distância. */
export function maxWeaponDamage(p: AttackPower): number {
  return Math.max(1, (p.weaponAttack * (p.skill + 10)) / 20 + p.level / 3) * p.vocationModifier;
}

/** Rola o dano bruto entre 35% e 100% do máximo. */
export function rollWeaponDamage(p: AttackPower, rng: Rng): number {
  const max = maxWeaponDamage(p);
  const min = max * 0.35;
  return Math.max(1, Math.round(min + (max - min) * rng.next()));
}

/** Chance de acerto à distância (cresce com a skill). */
export function distanceHitChance(skill: number): number {
  return Math.min(0.98, 0.82 + skill * 0.006);
}

/** Dano fixo de varinhas/cajados com pequeno bônus de Magic Level. */
export function rollWandDamage(range: readonly [number, number], magicLevel: number, vocationModifier: number, rng: Rng): number {
  const [min, max] = range;
  return Math.max(1, Math.round((min + (max - min) * rng.next() + magicLevel * 0.5) * vocationModifier));
}

export interface FormulaInput {
  level: number;
  /** Magic Level para magias; skill da arma para golpes. */
  power: number;
  weaponAttack: number;
  /** Dano médio da varinha/cajado equipado: as magias de ataque dos magos crescem com ela (como os golpes com a arma). */
  wandPower?: number;
}

/** Quanto a varinha reforça as magias de ataque: +1% a cada 1,5 de dano médio dela (a do nível 100 mais que dobra). */
export const WAND_SPELL_SCALE = 150;

/** Faixa [mín, máx] de uma magia (dano ou cura) antes de mitigação. */
export function spellRange(f: SpellFormula, input: FormulaInput, vocationModifier: number): [number, number] {
  let value: number;
  if (f.kind === 'magic')
    value =
      (input.level * f.levelFactor + input.power * f.powerFactor + f.base) *
      (1 + (input.wandPower ?? 0) / WAND_SPELL_SCALE);
  else value = (input.level * f.levelFactor + input.power * f.powerFactor) * (1 + input.weaponAttack / 20) + f.base;
  value *= vocationModifier;
  return [Math.max(1, Math.round(value * f.min)), Math.max(1, Math.round(value * f.max))];
}

export function rollRange([min, max]: [number, number], rng: Rng): number {
  return Math.round(min + (max - min) * rng.next());
}

export interface Defenses {
  armor: number;
  resistances?: Partial<Record<Element, number>>;
  /** Redução percentual de qualquer dano (buffs), 0..1. */
  damageReduction?: number;
  /** Redução extra de dano físico (vocação), 0..1. */
  physicalReduction?: number;
}

export interface MitigationResult {
  damage: number;
  /** O golpe foi totalmente absorvido pela armadura. */
  absorbed: boolean;
}

/** Aplica armadura (somente dano físico), resistências elementais e reduções percentuais. */
export function mitigate(raw: number, element: Element, def: Defenses, rng: Rng): MitigationResult {
  let dmg = raw;
  if (element === 'physical') {
    if (def.armor > 0) dmg -= Math.round(def.armor * (0.5 + 0.5 * rng.next()));
    dmg *= 1 - (def.physicalReduction ?? 0);
  }
  const res = def.resistances?.[element];
  if (res !== undefined) dmg *= res;
  dmg *= 1 - (def.damageReduction ?? 0);
  const damage = Math.max(0, Math.round(dmg));
  return { damage, absorbed: damage === 0 };
}

/** Chance de bloquear com escudo, baseada em Shielding e na defesa do escudo. */
export function blockChance(shielding: number, shieldDefense: number, base: number, perSkill: number, cap: number): number {
  if (shieldDefense <= 0) return 0;
  return Math.min(cap, base + shielding * perSkill + shieldDefense * 0.01);
}
