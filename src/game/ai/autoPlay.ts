// Ajudas automáticas do jogador humano (úteis no celular): pegar o loot ao alcance e beber poção no limiar escolhido.
// São opções do jogador (guardadas no aparelho); os heróis têm a própria IA e não passam por aqui.
import { chebyshev } from '../../domain/value-objects/position';
import { castCheck, castSpell } from '../abilities/spells';
import { nearbyLootBags, takeLoot, useInventoryItem } from '../inventory/inventoryService';
import { actorById, partyOf } from '../social/social';
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
  /** Cura sozinho com magia (Respiro Vital; o Druida usa a Bênção da Seiva, que cura o grupo). */
  autoHeal: boolean;
  /** Cura quando a vida (a sua ou, no Druida, a de um aliado do grupo) cai abaixo desta fração. */
  healBelow: number;
}

export const DEFAULT_AUTO: AutoSettings = {
  autoLoot: false,
  autoPotion: false,
  hpBelow: 0.4,
  manaBelow: 0.25,
  prefer: 'fit',
  autoHeal: false,
  healBelow: 0.6,
};

/** Índice da poção da mochila (de vida ou de mana) conforme a preferência; -1 se não houver. */
export function choosePotion(
  w: World,
  kind: 'heal' | 'mana',
  missing: number,
  prefer: AutoSettings['prefer'],
): number {
  const owned = w.player.character.inventory
    .map((st, i) => {
      const use = st ? w.data.items[st.itemId]?.use : undefined;
      return {
        i,
        v: kind === 'heal' ? (use?.heal ?? 0) : (use?.mana ?? 0),
        other: kind === 'heal' ? (use?.mana ?? 0) : (use?.heal ?? 0),
      };
    })
    .filter((p) => p.v > 0 && !p.other)
    .sort((a, b) => a.v - b.v);
  if (!owned.length) return -1;
  if (prefer === 'small') return owned[0]!.i;
  if (prefer === 'large') return owned[owned.length - 1]!.i;
  return (owned.find((p) => p.v >= missing * 0.8) ?? owned[owned.length - 1])!.i;
}

let nextAt = 0;

/** Vida (fração) do membro do grupo mais ferido ao alcance da Bênção da Seiva (inclui você). */
function weakestAround(w: World, radius: number): number {
  const p = w.player;
  let lowest = p.character.health / Math.max(1, p.stats.maxHealth);
  for (const id of partyOf(w, p.id)?.members ?? []) {
    const m = id === p.id ? null : actorById(w, id);
    if (!m || m.dead || chebyshev(m, p) > radius) continue;
    lowest = Math.min(lowest, m.character.health / Math.max(1, m.stats.maxHealth));
  }
  return lowest;
}

/** Cura sozinho com magia: o Druida abençoa o grupo quando alguém cai abaixo do limite; os demais curam a si mesmos. */
function autoHealSpell(w: World, below: number): boolean {
  const p = w.player;
  const mine = p.character.health / Math.max(1, p.stats.maxHealth);
  const sap = w.data.spells.sap_blessing;
  if (
    p.character.vocation === 'druid' &&
    sap &&
    weakestAround(w, sap.partyRadius ?? 4) < below &&
    castCheck(w, sap).ok
  )
    return castSpell(w, sap.id);
  const light = w.data.spells.light_heal;
  if (mine < below && light && castCheck(w, light).ok) return castSpell(w, light.id);
  return false;
}

/** Chamado a cada passo com o jogador humano como ator. */
export function updateAutoPlay(w: World): void {
  const a = w.auto;
  const p = w.player;
  if ((!a.autoLoot && !a.autoPotion && !a.autoHeal) || p.dead || w.now < nextAt) return;
  nextAt = w.now + 400;
  const healed = a.autoHeal && autoHealSpell(w, a.healBelow);
  if (a.autoPotion && !healed) {
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
