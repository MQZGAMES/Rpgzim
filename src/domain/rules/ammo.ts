// Munição (flechas): fica na mochila e é consumida direto de lá, sempre das mais fortes para as mais fracas.
import type { ItemStack } from '../entities/character';
import type { GameData } from '../entities/gameData';
import { removeAt } from './inventory';

export interface AmmoCount {
  itemId: string;
  /** Bônus de ataque que a flecha soma ao disparo. */
  attack: number;
  count: number;
}

/** Munição do tipo na mochila agrupada por item, da mais forte para a mais fraca. */
export function ammoBreakdown(data: GameData, inv: readonly (ItemStack | null)[], ammoType: string): AmmoCount[] {
  const by = new Map<string, AmmoCount>();
  for (const st of inv) {
    const def = st && data.items[st.itemId];
    if (!st || !def || def.type !== 'ammo' || def.ammoType !== ammoType) continue;
    const cur = by.get(st.itemId);
    if (cur) cur.count += st.count;
    else by.set(st.itemId, { itemId: st.itemId, attack: def.ammoAttack ?? 0, count: st.count });
  }
  return [...by.values()].sort((a, b) => b.attack - a.attack);
}

export function countAmmo(data: GameData, inv: readonly (ItemStack | null)[], ammoType: string): number {
  return ammoBreakdown(data, inv, ammoType).reduce((s, a) => s + a.count, 0);
}

/**
 * Consome `count` flechas, começando pelas mais fortes. Retorna quantas foram gastas e o bônus de ataque da
 * primeira (a que "sai" no disparo). Se faltar munição, gasta só o que houver.
 */
export function takeAmmo(data: GameData, inv: (ItemStack | null)[], ammoType: string, count = 1): { used: number; attack: number } {
  let used = 0;
  let attack = 0;
  for (const a of ammoBreakdown(data, inv, ammoType)) {
    let left = Math.min(a.count, count - used);
    for (let i = 0; i < inv.length && left > 0; i++) {
      const st = inv[i];
      if (!st || st.itemId !== a.itemId) continue;
      const take = Math.min(st.count, left);
      removeAt(inv, i, take);
      left -= take;
      if (used === 0) attack = a.attack;
      used += take;
    }
    if (used >= count) break;
  }
  return { used, attack };
}
