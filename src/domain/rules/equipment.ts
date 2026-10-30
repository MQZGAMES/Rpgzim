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
  // Sorcerer e Druid só atacam com varinha/cajado: nada de espadas, machados, maças, arcos ou lanças
  if (isMage(c.vocation) && def.weapon && def.weapon.kind !== 'wand') return { ok: false, reason: 'vocation' };
  if (def.minLevel && c.level < def.minLevel) return { ok: false, reason: 'level', detail: String(def.minLevel) };
  return { ok: true, slot: def.slot };
}

const isMage = (v: CharacterState['vocation']) => v === 'sorcerer' || v === 'druid';

/** A melhor varinha/cajado da vocação até o nível (a de nível mínimo mais alto que ele já pode usar). */
export function bestWandFor(data: GameData, c: CharacterState): ItemDef | undefined {
  return Object.values(data.items)
    .filter(
      (i) =>
        i.slot === 'mainHand' &&
        i.weapon?.kind === 'wand' &&
        !i.weapon.training &&
        (!i.vocations || i.vocations.includes(c.vocation)) &&
        (i.minLevel ?? 1) <= c.level,
    )
    .sort((a, b) => (b.minLevel ?? 1) - (a.minLevel ?? 1) || (b.value ?? 0) - (a.value ?? 0))[0];
}

/**
 * Mago com arma que não é varinha (espada, machado, arco...): a arma volta para a mochila (ou para o banco, se não
 * couber) e ele fica com a varinha/cajado certo — a melhor da mochila ou, sem nenhuma, a do nível dele.
 * Retorna o que mudou (para avisar), ou null se já estava certo.
 */
export function fixMageWeapon(data: GameData, c: CharacterState): { removed?: string; equipped?: string } | null {
  if (!isMage(c.vocation)) return null;
  const out: { removed?: string; equipped?: string } = {};
  const main = c.equipment.mainHand;
  const mainDef = main && data.items[main.itemId];
  if (main && mainDef?.weapon && mainDef.weapon.kind !== 'wand') {
    delete c.equipment.mainHand;
    if (addItem(data, c.inventory, main.itemId, main.count) < main.count)
      addItem(data, c.depot, main.itemId, main.count);
    out.removed = main.itemId;
  }
  // (só troca quando tirou uma arma errada: perder a varinha na morte não dá outra de graça)
  if (!c.equipment.mainHand && out.removed) {
    const own = c.inventory
      .map((st, i) => ({ st, i, def: st ? data.items[st.itemId] : undefined }))
      .filter((x) => x.def && x.def.weapon?.kind === 'wand' && !x.def.weapon.training && checkEquip(c, x.def).ok)
      .sort((a, b) => (b.def!.minLevel ?? 1) - (a.def!.minLevel ?? 1))[0];
    const best = bestWandFor(data, c);
    if (own && (!best || (own.def!.minLevel ?? 1) >= (best.minLevel ?? 1) - 8)) {
      c.equipment.mainHand = removeAt(c.inventory, own.i, 1)!;
      out.equipped = own.def!.id;
    } else if (best) {
      c.equipment.mainHand = { itemId: best.id, count: 1 };
      out.equipped = best.id;
    }
  }
  return out.removed || out.equipped ? out : null;
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

  // Itens que precisarão voltar para a mochila
  const displaced: EquipSlot[] = [];
  if (c.equipment[slot]) displaced.push(slot);
  if (slot === 'mainHand' && def.twoHanded && c.equipment.offHand) displaced.push('offHand');
  if (slot === 'offHand') {
    const main = c.equipment.mainHand && data.items[c.equipment.mainHand.itemId];
    if (main?.twoHanded) displaced.push('mainHand');
  }
  // Simula a troca numa cópia da mochila: só confirma se tudo couber (operação atômica).
  const inv = c.inventory.map((st) => (st ? { ...st } : null));
  const taken = removeAt(inv, index, 1)!;
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
