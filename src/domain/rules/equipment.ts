// Equipar e desequipar com verificação de compatibilidade (slot, vocação, nível e armas de duas mãos).
import type { CharacterState } from '../entities/character';
import type { EquipSlot, ItemDef } from '../entities/definitions';
import type { GameData } from '../entities/gameData';
import { addItem, canFit, removeAt } from './inventory';

export type EquipFailReason = 'notEquipable' | 'vocation' | 'level' | 'inventoryFull' | 'empty';

export type EquipResult = { ok: true; slot: EquipSlot } | { ok: false; reason: EquipFailReason; detail?: string };

export function checkEquip(c: CharacterState, def: ItemDef): EquipResult {
  if (!def.slot) return { ok: false, reason: 'notEquipable' };
  if (def.vocations && !def.vocations.includes(c.vocation)) return { ok: false, reason: 'vocation' };
  if (def.minLevel && c.level < def.minLevel) return { ok: false, reason: 'level', detail: String(def.minLevel) };
  return { ok: true, slot: def.slot };
}

/** Equipa o item da posição `index` da mochila, devolvendo à mochila o que estava no slot. */
export function equipFromInventory(data: GameData, c: CharacterState, index: number): EquipResult {
  const stack = c.inventory[index];
  if (!stack) return { ok: false, reason: 'empty' };
  const def = data.items[stack.itemId];
  if (!def) return { ok: false, reason: 'notEquipable' };
  const check = checkEquip(c, def);
  if (!check.ok) return check;
  const slot = check.slot;

  // Munição igual à equipada: apenas soma à pilha do slot
  const current = c.equipment[slot];
  if (slot === 'ammo' && current && current.itemId === stack.itemId) {
    current.count += stack.count;
    c.inventory[index] = null;
    return { ok: true, slot };
  }

  // Itens que precisarão voltar para a mochila
  const displaced: EquipSlot[] = [];
  if (c.equipment[slot]) displaced.push(slot);
  if (slot === 'mainHand' && def.twoHanded && c.equipment.offHand) displaced.push('offHand');
  if (slot === 'offHand') {
    const main = c.equipment.mainHand && data.items[c.equipment.mainHand.itemId];
    if (main?.twoHanded) displaced.push('mainHand');
  }
  // Simula a troca numa cópia da mochila: só confirma se tudo couber (operação atômica).
  const moving = slot === 'ammo' ? stack.count : 1;
  const inv = c.inventory.map((st) => (st ? { ...st } : null));
  const taken = removeAt(inv, index, moving)!;
  for (const s of displaced) {
    const st = c.equipment[s]!;
    if (addItem(data, inv, st.itemId, st.count) < st.count) return { ok: false, reason: 'inventoryFull' };
  }
  for (const s of displaced) delete c.equipment[s];
  c.inventory.splice(0, c.inventory.length, ...inv);
  c.equipment[slot] = taken;
  return { ok: true, slot };
}

export function unequip(data: GameData, c: CharacterState, slot: EquipSlot): EquipResult {
  const st = c.equipment[slot];
  if (!st) return { ok: false, reason: 'empty' };
  if (!canFit(data, c.inventory, st.itemId, st.count)) return { ok: false, reason: 'inventoryFull' };
  delete c.equipment[slot];
  addItem(data, c.inventory, st.itemId, st.count);
  return { ok: true, slot };
}

export const EQUIP_FAIL_MESSAGE: Record<EquipFailReason, string> = {
  notEquipable: 'Este item não pode ser equipado.',
  vocation: 'Sua vocação não pode usar este item.',
  level: 'Nível insuficiente para este item.',
  inventoryFull: 'Sem espaço na mochila.',
  empty: 'Nada para equipar.',
};
