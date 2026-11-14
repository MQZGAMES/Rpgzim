// Regeneração natural de mana (a vida tem a regra na simulação). Usada pela simulação e pela IA, que estima quanta
// magia um personagem consegue sustentar numa luta.
import type { GameData } from '../entities/gameData';
import type { VocationId } from '../value-objects/ids';

/**
 * Mana natural por ciclo de regeneração (a cada `regenTickMs`, 2 s), como no Tibia: só a base da vocação, sem crescer
 * com o nível. A mana de verdade vem das poções; assim a cura por magia não fica infinita. Na PZ a mana não volta.
 */
export function manaPerTick(data: GameData, vocation: VocationId): number {
  return data.vocations[vocation].regen.mana;
}

/** Mana recuperada por segundo fora da área protegida, sem comida. */
export function manaRegenPerSecond(data: GameData, vocation: VocationId, _level?: number): number {
  return manaPerTick(data, vocation) / (data.balance.player.regenTickMs / 1000);
}
