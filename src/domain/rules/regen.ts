// Regeneração natural de mana (a vida tem a regra na simulação). Usada pela simulação e pela IA, que estima quanta
// magia um personagem consegue sustentar numa luta.
import type { GameData } from '../entities/gameData';
import type { VocationId } from '../value-objects/ids';

/** Fora da PZ a mana volta nesta proporção (a PZ não recupera mana, então o campo compensa). */
export const MANA_REGEN_OUTSIDE_PZ = 2;

/** Mana recuperada por segundo fora da área protegida, sem comida. */
export function manaRegenPerSecond(data: GameData, vocation: VocationId, level: number): number {
  const perTick = (data.vocations[vocation].regen.mana + Math.floor(level / 4)) * MANA_REGEN_OUTSIDE_PZ;
  return perTick / (data.balance.player.regenTickMs / 1000);
}
