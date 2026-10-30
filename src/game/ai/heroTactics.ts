// Táticas dos heróis que não dependem do estado interno do cérebro: personalidade, conta de mana das magias de
// área, foco do grupo e posição na retaguarda (atrás do tanque, longe das criaturas).
// O cérebro (heroBrain) decide QUANDO usar cada uma; aqui fica só o COMO.
import type { Temperament } from '../../domain/entities/definitions';
import { spellRange } from '../../domain/rules/damage';
import { chebyshev } from '../../domain/value-objects/position';
import type { HeroEntity, MonsterEntity, PlayerEntity } from '../entities/types';
import { canEnter } from '../movement/movement';
import type { World } from '../simulation/World';
import { isPz } from '../world/GameMap';

// ------------------------------------------------------------------ personalidade
export type PersonaId = 'agressivo' | 'cauteloso' | 'ganancioso' | 'equilibrado';

export interface Persona {
  id: PersonaId;
  label: string;
  /** Somado à margem que a régua exige para puxar uma luta (negativo = arrisca mais). */
  margin: number;
  /** Somado à margem abaixo da qual ele foge (positivo = foge mais cedo). */
  flee: number;
  /** Somado ao limiar de vida em que bebe a poção (positivo = bebe mais cedo). */
  drink: number;
  /** Tiles a mais em que enxerga (e vai buscar) loot no chão. */
  lootScan: number;
  /** Multiplica o valor de loot que justifica ir vender (maior = enche mais a mochila antes). */
  lootTrip: number;
}

const PERSONAS: Record<PersonaId, Persona> = {
  agressivo: { id: 'agressivo', label: 'Agressivo', margin: -0.15, flee: -0.1, drink: -0.03, lootScan: 0, lootTrip: 1 },
  cauteloso: { id: 'cauteloso', label: 'Cauteloso', margin: 0.2, flee: 0.12, drink: 0.07, lootScan: 0, lootTrip: 0.9 },
  ganancioso: { id: 'ganancioso', label: 'Ganancioso', margin: 0, flee: 0, drink: 0, lootScan: 4, lootTrip: 1.4 },
  equilibrado: { id: 'equilibrado', label: 'Equilibrado', margin: 0, flee: 0, drink: 0, lootScan: 0, lootTrip: 1 },
};

/**
 * Perfil de comportamento a partir do temperamento: coragem bem acima da prudência = agressivo; o contrário =
 * cauteloso; ganância alta = ganancioso; senão equilibrado. Cada perfil muda os limites de risco, fuga e loot.
 */
export function personaOf(t: Temperament): Persona {
  if (t.bravery - t.caution >= 0.25) return PERSONAS.agressivo;
  if (t.caution - t.bravery >= 0.25) return PERSONAS.cauteloso;
  if (t.greed >= 0.68) return PERSONAS.ganancioso;
  return PERSONAS.equilibrado;
}

// ------------------------------------------------------------------ conta de mana das magias
/** Dano médio de uma magia de ataque deste personagem (antes da armadura), pela mesma fórmula da conjuração. */
export function spellAverage(w: World, h: PlayerEntity, spellId: string): number {
  const spell = w.data.spells[spellId];
  if (!spell?.formula || spell.effect !== 'damage') return 0;
  const voc = w.data.vocations[h.character.vocation];
  const f = spell.formula;
  const power =
    f.kind === 'magic'
      ? h.stats.magicLevel
      : f.kind === 'distance'
        ? h.stats.skills.distance
        : h.stats.skills[h.stats.weapon.skill === 'magic' ? 'club' : h.stats.weapon.skill];
  const mod = f.kind === 'magic' ? voc.damage.magic : f.kind === 'distance' ? voc.damage.distance : voc.damage.melee;
  const wand = h.stats.weapon.kind === 'wand' ? h.stats.weapon.damage : undefined;
  const [lo, hi] = spellRange(
    f,
    { level: h.character.level, power, weaponAttack: h.stats.weapon.attack, wandPower: wand ? (wand[0] + wand[1]) / 2 : 0 },
    mod,
  );
  return (lo + hi) / 2;
}

/**
 * A magia de área compensa contra `n` criaturas? Com mana curta compara o dano por ponto de mana (vezes as criaturas
 * atingidas) com o da magia de alvo único; com mana sobrando (`rich`), o dano de cada conjuração. Com uma criatura só,
 * nunca (gasta mais mana para o mesmo efeito).
 */
export function aoeWorth(w: World, h: PlayerEntity, aoeId: string, singleId: string, n: number, rich = false): boolean {
  if (n < 2) return false;
  const aoe = w.data.spells[aoeId];
  const single = w.data.spells[singleId];
  if (!aoe) return false;
  if (!single) return true;
  const aoeHit = spellAverage(w, h, aoeId) * n;
  const singleHit = spellAverage(w, h, singleId);
  if (rich) return aoeHit >= singleHit * 1.1;
  return aoeHit / Math.max(1, aoe.manaCost) >= singleHit / Math.max(1, single.manaCost);
}

// ------------------------------------------------------------------ foco do grupo
/**
 * Alvo de foco entre as criaturas que ameaçam o grupo: a que mais colegas já atacam e a de menos vida (morre primeiro,
 * para de bater antes). Atiradores (que acertam os magos de longe) e quem bate num colega frágil sobem na fila.
 */
export function focusPick(
  h: PlayerEntity,
  members: readonly PlayerEntity[],
  candidates: readonly MonsterEntity[],
): MonsterEntity | undefined {
  let best: { m: MonsterEntity; score: number } | undefined;
  for (const m of candidates) {
    const hitters = members.filter((a) => a.id !== h.id && a.targetId === m.id).length;
    const victim = members.find((a) => a.id === m.targetId);
    const fragile = victim && victim.character.vocation !== 'knight' ? 1 : 0;
    const shooter = m.def.attack.kind === 'ranged' ? 1 : 0;
    const score = hitters * 3 + (1 - m.hp / Math.max(1, m.def.health)) * 4 + fragile * 1.5 + shooter * 1.5 - chebyshev(m, h) * 0.25;
    if (!best || score > best.score) best = { m, score };
  }
  return best?.m;
}

// ------------------------------------------------------------------ posição na luta
/**
 * Um passo para a retaguarda: o tile vizinho que fica mais longe das criaturas corpo a corpo, sem passar de `maxFromTank`
 * do tanque e sem sair do alcance do alvo (`target`, `range`). Retorna o passo (dx, dy) ou null se ficar parado é melhor.
 */
export function backlineStep(
  w: World,
  h: HeroEntity,
  foes: readonly MonsterEntity[],
  tank: PlayerEntity | null,
  target: { x: number; y: number } | null,
  range: number,
  maxFromTank = 4,
): { dx: number; dy: number } | null {
  if (!foes.length) return null;
  const danger = (x: number, y: number) =>
    foes.reduce((s, m) => s + Math.max(0, 4 - Math.max(Math.abs(m.x - x), Math.abs(m.y - y))), 0);
  const value = (x: number, y: number) => {
    let v = -danger(x, y) * 2;
    if (tank) v -= Math.max(0, Math.max(Math.abs(tank.x - x), Math.abs(tank.y - y)) - maxFromTank) * 3;
    if (target && Math.max(Math.abs(target.x - x), Math.abs(target.y - y)) > range) v -= 6;
    return v;
  };
  const here = value(h.x, h.y);
  let best: { dx: number; dy: number; v: number } | null = null;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = h.x + dx;
      const y = h.y + dy;
      if (!canEnter(w, x, y, false, h.id) || isPz(w.map, x, y)) continue;
      const v = value(x, y);
      if (v > here + 0.5 && (!best || v > best.v)) best = { dx, dy, v };
    }
  return best ? { dx: best.dx, dy: best.dy } : null;
}
