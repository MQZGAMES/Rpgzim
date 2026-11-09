// Modo guerra: como um personagem mede as forças antes de atacar outro (ou de fugir dele).
// A regra de ouro: não vale a pena atacar sozinho quem é muito mais forte — mas um grupo (ou a guilda reunida) pode.
// Por isso a conta é sempre "meu lado contra o lado dele": cada um soma a própria força com a dos aliados por perto.
import { chebyshev } from '../../domain/value-objects/position';
import type { Temperament } from '../../domain/entities/definitions';
import type { PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors } from '../simulation/World';
import { isPz } from '../world/GameMap';
import { isWarAlly, isWarEnemy } from '../social/social';

/** Raio em que os aliados contam como "do meu lado" na briga. */
export const WAR_SIDE_RADIUS = 8;

/** Força de combate de um personagem: nível, vida (pesa a vida atual), armadura e arma. */
export function power(a: {
  character: { level: number; health: number };
  stats: { maxHealth: number; armor: number; weapon: { attack: number; damage?: readonly [number, number] } };
}): number {
  const hp = a.character.health / Math.max(1, a.stats.maxHealth);
  const atk = a.stats.weapon.damage
    ? (a.stats.weapon.damage[0] + a.stats.weapon.damage[1]) / 2
    : a.stats.weapon.attack;
  return a.character.level * 12 + a.stats.maxHealth * 0.25 * (0.4 + hp * 0.6) + a.stats.armor * 2 + atk * 3;
}

/** Aliados de guerra (grupo ou guilda) de `a`, vivos, a até `radius` de `at` e fora da área protegida. */
export function warAlliesNear(
  w: World,
  a: PlayerEntity,
  at: { x: number; y: number },
  radius = WAR_SIDE_RADIUS,
): PlayerEntity[] {
  return allActors(w).filter(
    (o) =>
      o !== a &&
      !o.dead &&
      isWarAlly(w, a.id, o.id) &&
      chebyshev(o, at) <= radius &&
      !isPz(w.map, o.x, o.y),
  );
}

/** Força de um lado: o personagem e os aliados perto dele (80% cada: nem sempre entram todos juntos). */
export function sideStrength(w: World, a: PlayerEntity, radius = WAR_SIDE_RADIUS): number {
  return warAlliesNear(w, a, a, radius).reduce((s, o) => s + power(o) * 0.8, power(a));
}

/** Vantagem de `h` contra `foe`: força do lado de `h` dividida pela do lado de `foe` (>1 = vantagem). */
export function warOdds(w: World, h: PlayerEntity, foe: PlayerEntity): number {
  return sideStrength(w, h) / Math.max(1, sideStrength(w, foe));
}

/** Inimigos de `h` vivos a até `radius`, fora da área protegida. */
export function warEnemiesNear(w: World, h: PlayerEntity, radius: number): PlayerEntity[] {
  return allActors(w).filter(
    (o) => o !== h && !o.dead && isWarEnemy(w, h.id, o.id) && chebyshev(o, h) <= radius && !isPz(w.map, o.x, o.y),
  );
}

/**
 * Pressão inimiga em volta: a força somada de todos os inimigos por perto. No "cada um por si" eles também brigam
 * entre si, mas quem está em menor número não conta com isso.
 */
export function enemyPressure(w: World, h: PlayerEntity, radius = 7): number {
  return warEnemiesNear(w, h, radius).reduce((s, o) => s + power(o), 0);
}

/**
 * Vantagem mínima para começar uma briga: o corajoso aceita briga equilibrada, o prudente só ataca com folga; o
 * humor (ganhando ou perdendo) mexe um pouco. Sempre entre 0,95 e 1,6.
 */
export function engageNeed(t: Temperament, mood: number): number {
  const v = 1.25 - (t.bravery - 0.5) * 0.5 + (t.caution - 0.5) * 0.4 - mood * 0.08;
  return Math.max(0.95, Math.min(1.6, v));
}
