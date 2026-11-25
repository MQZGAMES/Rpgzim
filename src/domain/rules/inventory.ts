// Mochila com capacidade fixa e pilhas. As funções alteram o array recebido e retornam o resultado.
import type { ItemStack } from '../entities/character';
import type { GameData } from '../entities/gameData';

export type Inventory = (ItemStack | null)[];

export const DEFAULT_MAX_STACK = 100;

export function maxStackOf(data: GameData, itemId: string): number {
  const def = data.items[itemId];
  if (!def?.stackable) return 1;
  return def.maxStack ?? DEFAULT_MAX_STACK;
}

export function countItem(inv: Inventory, itemId: string): number {
  return inv.reduce((s, st) => s + (st && st.itemId === itemId ? st.count : 0), 0);
}

/** Quantas unidades cabem na mochila (pilhas existentes + espaços livres). */
export function capacityFor(data: GameData, inv: Inventory, itemId: string): number {
  const max = maxStackOf(data, itemId);
  let room = 0;
  for (const st of inv) {
    if (!st) room += max;
    else if (st.itemId === itemId && max > 1) room += Math.max(0, max - st.count);
  }
  return room;
}

export function canFit(data: GameData, inv: Inventory, itemId: string, count: number): boolean {
  return capacityFor(data, inv, itemId) >= count;
}

/** Adiciona até `count` unidades; retorna quantas foram efetivamente adicionadas. */
export function addItem(data: GameData, inv: Inventory, itemId: string, count: number): number {
  if (!data.items[itemId]) throw new Error(`Item desconhecido: ${itemId}`);
  const max = maxStackOf(data, itemId);
  let left = count;
  if (max > 1) {
    for (const st of inv) {
      if (left <= 0) break;
      if (st && st.itemId === itemId && st.count < max) {
        const add = Math.min(left, max - st.count);
        st.count += add;
        left -= add;
      }
    }
  }
  for (let i = 0; i < inv.length && left > 0; i++) {
    if (inv[i] === null) {
      const add = Math.min(left, max);
      inv[i] = { itemId, count: add };
      left -= add;
    }
  }
  return count - left;
}

/** Remove até `count` unidades (das últimas pilhas para as primeiras); retorna quantas foram removidas. */
export function removeItem(inv: Inventory, itemId: string, count: number): number {
  let left = count;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const st = inv[i];
    if (st && st.itemId === itemId) {
      const take = Math.min(left, st.count);
      st.count -= take;
      left -= take;
      if (st.count <= 0) inv[i] = null;
    }
  }
  return count - left;
}

export function removeAt(inv: Inventory, index: number, count: number): ItemStack | null {
  const st = inv[index];
  if (!st) return null;
  const take = Math.min(count, st.count);
  st.count -= take;
  if (st.count <= 0) inv[index] = null;
  return { itemId: st.itemId, count: take };
}

export function freeSlots(inv: Inventory): number {
  return inv.filter((s) => s === null).length;
}

/** Junta pilhas incompletas e move itens para o início (organização da mochila). */
export function compact(data: GameData, inv: Inventory): void {
  const items = inv.filter((s): s is ItemStack => s !== null).map((s) => ({ ...s }));
  inv.fill(null);
  for (const st of items) addItem(data, inv, st.itemId, st.count);
}

export type InventorySortKey = 'type' | 'value';
export type SortDir = 'asc' | 'desc';

/** Ordem dos tipos na mochila: armas e equipamento primeiro, depois consumíveis e, por fim, loot. */
const TYPE_ORDER: readonly string[] = [
  'weapon',
  'shield',
  'spellbook',
  'helmet',
  'armor',
  'legs',
  'boots',
  'amulet',
  'ring',
  'potion',
  'food',
  'loot',
];

/**
 * Organiza a mochila: junta pilhas incompletas, tira os espaços vazios e ordena.
 * - "type": pela ordem dos tipos (`desc` inverte os grupos); dentro do tipo, do mais valioso ao mais barato.
 * - "value": pelo valor de uma unidade (`asc` = mais barato primeiro); empate pelo tipo e pelo nome.
 */
export function sortInventory(data: GameData, inv: Inventory, key: InventorySortKey, dir: SortDir): void {
  compact(data, inv);
  const items = inv.filter((s): s is ItemStack => s !== null);
  const typeRank = (s: ItemStack) => {
    const i = TYPE_ORDER.indexOf(data.items[s.itemId]?.type ?? 'loot');
    return i < 0 ? TYPE_ORDER.length : i;
  };
  const value = (s: ItemStack) => data.items[s.itemId]?.value ?? 0;
  const name = (s: ItemStack) => data.items[s.itemId]?.name ?? s.itemId;
  const sign = dir === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    if (key === 'type')
      return sign * (typeRank(a) - typeRank(b)) || value(b) - value(a) || name(a).localeCompare(name(b), 'pt-BR');
    return sign * (value(a) - value(b)) || typeRank(a) - typeRank(b) || name(a).localeCompare(name(b), 'pt-BR');
  });
  inv.fill(null);
  items.forEach((s, i) => (inv[i] = s));
}
