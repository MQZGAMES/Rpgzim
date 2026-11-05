// Poções por tamanho: cada uma tem nível mínimo (as pequenas servem para todos). Quem escolhe a poção (atalho
// automático, cura automática, IA dos heróis) só considera as que o personagem já pode beber.
import type { CharacterState } from '../entities/character';
import type { ItemDef } from '../entities/definitions';
import type { GameData } from '../entities/gameData';

export type PotionKind = 'heal' | 'mana';

/** É uma poção só de vida (`heal`) ou só de mana (`mana`)? */
export function potionKind(def: ItemDef | undefined): PotionKind | null {
  if (!def || def.type !== 'potion' || !def.use) return null;
  if (def.use.heal && !def.use.mana) return 'heal';
  if (def.use.mana && !def.use.heal) return 'mana';
  return null;
}

/** O personagem já tem nível para beber esta poção? */
export function canDrink(def: ItemDef | undefined, level: number): boolean {
  return !!def && (def.minLevel ?? 1) <= level;
}

/** Quanto a poção recupera (vida ou mana). */
export const potionAmount = (def: ItemDef | undefined, kind: PotionKind): number => def?.use?.[kind] ?? 0;

/** Poções de um tipo, da menor para a maior. */
export function potionsByKind(data: GameData, kind: PotionKind): ItemDef[] {
  return Object.values(data.items)
    .filter((d) => potionKind(d) === kind)
    .sort((a, b) => potionAmount(a, kind) - potionAmount(b, kind));
}

/** Quantas poções de um tipo o personagem tem e pode beber. */
export function usablePotionCount(data: GameData, c: CharacterState, kind: PotionKind): number {
  return c.inventory.reduce((s, st) => {
    const def = st ? data.items[st.itemId] : undefined;
    return st && potionKind(def) === kind && canDrink(def, c.level) ? s + st.count : s;
  }, 0);
}

/** A maior poção do tipo que o personagem já pode beber (a "do nível dele"). */
export function bestPotionFor(data: GameData, level: number, kind: PotionKind): ItemDef | undefined {
  return potionsByKind(data, kind)
    .filter((d) => canDrink(d, level))
    .pop();
}
