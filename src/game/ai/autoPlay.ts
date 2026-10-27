// Ajudas automáticas do jogador humano (úteis no celular): pegar o loot ao alcance e beber poção no limiar escolhido.
// São opções do jogador (guardadas no aparelho); os heróis têm a própria IA e não passam por aqui.
import { nearbyLootBags, takeLoot, useInventoryItem } from '../inventory/inventoryService';
import type { World } from '../simulation/World';

export interface AutoSettings {
  autoLoot: boolean;
  autoPotion: boolean;
  /** Bebe poção de vida abaixo desta fração da vida máxima. */
  hpBelow: number;
  /** Bebe poção de mana abaixo desta fração da mana máxima (0 = desligado). */
  manaBelow: number;
  /** Qual poção usar primeiro: a que mais se ajusta ao que falta, a menor ou a maior. */
  prefer: 'fit' | 'small' | 'large';
}

export const DEFAULT_AUTO: AutoSettings = { autoLoot: false, autoPotion: false, hpBelow: 0.4, manaBelow: 0.25, prefer: 'fit' };

/** Índice da poção da mochila (de vida ou de mana) conforme a preferência; -1 se não houver. */
export function choosePotion(w: World, kind: 'heal' | 'mana', missing: number, prefer: AutoSettings['prefer']): number {
  const owned = w.player.character.inventory
    .map((st, i) => {
      const use = st ? w.data.items[st.itemId]?.use : undefined;
      return { i, v: kind === 'heal' ? (use?.heal ?? 0) : (use?.mana ?? 0), other: kind === 'heal' ? (use?.mana ?? 0) : (use?.heal ?? 0) };
    })
    .filter((p) => p.v > 0 && !p.other)
    .sort((a, b) => a.v - b.v);
  if (!owned.length) return -1;
  if (prefer === 'small') return owned[0]!.i;
  if (prefer === 'large') return owned[owned.length - 1]!.i;
  return (owned.find((p) => p.v >= missing * 0.8) ?? owned[owned.length - 1])!.i;
}

let nextAt = 0;

/** Chamado a cada passo com o jogador humano como ator. */
export function updateAutoPlay(w: World): void {
  const a = w.auto;
  const p = w.player;
  if ((!a.autoLoot && !a.autoPotion) || p.dead || w.now < nextAt) return;
  nextAt = w.now + 400;
  if (a.autoPotion) {
    const pct = p.character.health / Math.max(1, p.stats.maxHealth);
    const manaPct = p.character.mana / Math.max(1, p.stats.maxMana);
    if (pct < a.hpBelow) {
      const idx = choosePotion(w, 'heal', p.stats.maxHealth - p.character.health, a.prefer);
      if (idx >= 0) useInventoryItem(w, idx);
    } else if (a.manaBelow > 0 && manaPct < a.manaBelow) {
      const idx = choosePotion(w, 'mana', p.stats.maxMana - p.character.mana, a.prefer);
      if (idx >= 0) useInventoryItem(w, idx);
    }
  }
  // pega o loot ao alcance (menos o que você mesmo jogou no chão)
  if (a.autoLoot) for (const bag of nearbyLootBags(w)) if (!bag.dropped) takeLoot(w, bag.id, 'all');
}
