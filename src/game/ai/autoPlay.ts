// Ajudas automáticas do jogador humano (úteis no celular): pegar o loot ao alcance e beber poção no limiar escolhido.
// São opções do jogador (guardadas no aparelho); os heróis têm a própria IA e não passam por aqui.
import { chebyshev } from '../../domain/value-objects/position';
import { castCheck, castSpell } from '../abilities/spells';
import { nearbyLootBags, takeLoot, useInventoryItem } from '../inventory/inventoryService';
import { actorById, partyOf } from '../social/social';
import type { World } from '../simulation/World';

export interface AutoSettings {
  /** Pegar o loot ao alcance sozinho. */
  autoLoot: boolean;
  /** Cura automática (caixa principal): liga as opções abaixo. */
  autoHeal: boolean;
  /** Usar poção de cura abaixo desta fração da vida máxima. */
  potionHp: boolean;
  hpBelow: number;
  /** Usar poção de mana abaixo desta fração da mana máxima. */
  potionMana: boolean;
  manaBelow: number;
  /** Usar magia de cura (Respiro Vital) abaixo desta fração da vida. */
  spellHeal: boolean;
  healBelow: number;
  /** Druida: Cura Intensa no grupo quando você ou um aliado a até 12 tiles cai abaixo desta fração. */
  healGroup: boolean;
  groupBelow: number;
  /** Qual poção usar primeiro: a que mais se ajusta ao que falta, a menor ou a maior. */
  prefer: 'fit' | 'small' | 'large';
}

export const DEFAULT_AUTO: AutoSettings = {
  autoLoot: false,
  autoHeal: false,
  potionHp: true,
  hpBelow: 0.4,
  potionMana: true,
  manaBelow: 0.25,
  spellHeal: false,
  healBelow: 0.6,
  healGroup: false,
  groupBelow: 0.5,
  prefer: 'fit',
};

/** Aceita o formato antigo das configurações (autoPotion/autoHeal avulsos) e completa o que falta com os padrões. */
export function migrateAuto(saved: Record<string, unknown>): Partial<AutoSettings> {
  if ('potionHp' in saved || !('autoPotion' in saved)) return saved as Partial<AutoSettings>;
  const oldPotion = saved.autoPotion === true;
  const oldSpell = saved.autoHeal === true;
  return {
    ...(saved as Partial<AutoSettings>),
    autoHeal: oldPotion || oldSpell,
    potionHp: oldPotion,
    potionMana: oldPotion && Number(saved.manaBelow ?? 0) > 0,
    spellHeal: oldSpell,
  };
}

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

/** Cura sozinho com magia: Cura Intensa no grupo (Druida) e/ou Respiro Vital em si mesmo. */
function autoHealSpell(w: World, a: AutoSettings): boolean {
  const p = w.player;
  const sap = w.data.spells.sap_blessing;
  if (
    a.healGroup &&
    p.character.vocation === 'druid' &&
    sap &&
    weakestAround(w, sap.partyRadius ?? 12) < a.groupBelow &&
    castCheck(w, sap).ok
  )
    return castSpell(w, sap.id);
  const light = w.data.spells.light_heal;
  const mine = p.character.health / Math.max(1, p.stats.maxHealth);
  if (a.spellHeal && mine < a.healBelow && light && castCheck(w, light).ok) return castSpell(w, light.id);
  return false;
}

/** Chamado a cada passo com o jogador humano como ator. */
export function updateAutoPlay(w: World): void {
  const a = w.auto;
  const p = w.player;
  if ((!a.autoLoot && !a.autoHeal) || p.dead || w.now < nextAt) return;
  nextAt = w.now + 400;
  if (a.autoHeal) {
    const healed = autoHealSpell(w, a);
    const pct = p.character.health / Math.max(1, p.stats.maxHealth);
    const manaPct = p.character.mana / Math.max(1, p.stats.maxMana);
    if (!healed && a.potionHp && pct < a.hpBelow) {
      const idx = choosePotion(w, 'heal', p.stats.maxHealth - p.character.health, a.prefer);
      if (idx >= 0) useInventoryItem(w, idx);
    } else if (!healed && a.potionMana && a.manaBelow > 0 && manaPct < a.manaBelow) {
      const idx = choosePotion(w, 'mana', p.stats.maxMana - p.character.mana, a.prefer);
      if (idx >= 0) useInventoryItem(w, idx);
    }
  }
  // pega o loot ao alcance (menos o que você mesmo jogou no chão)
  if (a.autoLoot) for (const bag of nearbyLootBags(w)) if (!bag.dropped) takeLoot(w, bag.id, 'all');
}
