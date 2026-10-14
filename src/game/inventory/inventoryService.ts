// Ações de inventário com efeitos no mundo: usar consumíveis, equipar, desequipar, coletar loot.
import type { EquipSlot } from '../../domain/entities/definitions';
import { POTION, isReady, startCooldown } from '../../domain/rules/cooldowns';
import { EQUIP_FAIL_MESSAGE, equipFromInventory, unequip } from '../../domain/rules/equipment';
import { addItem, removeAt } from '../../domain/rules/inventory';
import type { World } from '../simulation/World';
import type { LootContainer } from '../entities/types';
import { message, warnThrottled } from '../simulation/World';
import { refreshStats } from '../progression/progression';

export function useInventoryItem(w: World, index: number): boolean {
  const p = w.player;
  const c = p.character;
  if (p.dead) return false;
  const stack = c.inventory[index];
  if (!stack) return false;
  const def = w.data.items[stack.itemId];
  if (!def) return false;
  if (def.slot) return equipItem(w, index);
  if (!def.use) {
    warnThrottled(w, 'nouse', 'Este item não pode ser usado.', 800);
    return false;
  }
  if (!isReady(p.cooldowns, POTION, w.now)) {
    warnThrottled(w, 'potioncd', 'Aguarde um instante para usar outro item.', 600);
    return false;
  }
  const u = def.use;
  if (u.heal && c.health >= p.stats.maxHealth && !u.mana) {
    warnThrottled(w, 'fullhp', 'Sua vida já está cheia.', 1000);
    return false;
  }
  if (u.mana && c.mana >= p.stats.maxMana && !u.heal) {
    warnThrottled(w, 'fullmp', 'Sua mana já está cheia.', 1000);
    return false;
  }
  startCooldown(p.cooldowns, POTION, w.now, u.cooldownMs);
  removeAt(c.inventory, index, 1);
  const pos = { x: p.x, y: p.y };
  if (u.heal) {
    const before = c.health;
    c.health = Math.min(p.stats.maxHealth, c.health + u.heal);
    w.events.emit('heal', { targetId: p.id, amount: c.health - before, mana: false, position: pos });
  }
  if (u.mana) {
    const before = c.mana;
    c.mana = Math.min(p.stats.maxMana, c.mana + u.mana);
    w.events.emit('heal', { targetId: p.id, amount: c.mana - before, mana: true, position: pos });
  }
  if (u.regen) {
    p.food = { health: u.regen.health, mana: u.regen.mana, until: w.now + u.regen.durationMs };
    message(w, `${def.name}: regeneração ativa por ${Math.round(u.regen.durationMs / 1000)}s.`, 'info');
  }
  w.events.emit('itemUsed', { itemId: def.id });
  w.events.emit('itemsChanged', {});
  return true;
}

/** Usa a primeira poção do tipo indicado (atalho rápido da interface). */
export function useItemById(w: World, itemId: string): boolean {
  const idx = w.player.character.inventory.findIndex((s) => s?.itemId === itemId);
  if (idx < 0) {
    warnThrottled(w, 'noitem', 'Você não possui este item.', 800);
    return false;
  }
  return useInventoryItem(w, idx);
}

export function equipItem(w: World, index: number): boolean {
  const name = w.data.items[w.player.character.inventory[index]?.itemId ?? '']?.name;
  const res = equipFromInventory(w.data, w.player.character, index);
  if (!res.ok) {
    warnThrottled(w, `equip:${res.reason}`, res.reason === 'level' ? `Requer nível ${res.detail}.` : EQUIP_FAIL_MESSAGE[res.reason], 600);
    return false;
  }
  if (name) message(w, `Equipado: ${name}.`, 'info');
  afterEquipmentChange(w);
  return true;
}

export function unequipSlot(w: World, slot: EquipSlot): boolean {
  const name = w.data.items[w.player.character.equipment[slot]?.itemId ?? '']?.name;
  const res = unequip(w.data, w.player.character, slot);
  if (!res.ok) {
    warnThrottled(w, `unequip:${res.reason}`, EQUIP_FAIL_MESSAGE[res.reason], 600);
    return false;
  }
  if (name) message(w, `Desequipado: ${name}.`, 'info');
  afterEquipmentChange(w);
  return true;
}

function afterEquipmentChange(w: World): void {
  const p = w.player;
  refreshStats(w);
  // trocar de arma reinicia o alvo de alcance (ex.: de arco para espada)
  p.nextAttackAt = Math.max(p.nextAttackAt, w.now + 300);
  w.events.emit('itemsChanged', {});
  w.events.emit('saveRequested', { reason: 'equipment' });
}

/** Coleta itens de um saco de loot: índice específico ou tudo ('all'). Ouro vai direto para a bolsa. */
export function takeLoot(w: World, containerId: string, which: number | 'all'): void {
  const bag = w.lootBags.get(containerId);
  const c = w.player.character;
  if (!bag) return;
  if (bag.gold > 0 && (which === 'all' || which === -1)) {
    c.gold += bag.gold;
    w.events.emit('goldChanged', { amount: c.gold, delta: bag.gold });
    message(w, `+${bag.gold} de ouro.`, 'loot');
    bag.gold = 0;
  }
  const indices = which === 'all' ? bag.items.map((_, i) => i) : which >= 0 ? [which] : [];
  let full = false;
  for (const i of indices.reverse()) {
    const st = bag.items[i];
    if (!st) continue;
    const added = addItem(w.data, c.inventory, st.itemId, st.count);
    if (added > 0) message(w, `Coletado: ${added}x ${w.data.items[st.itemId]?.name ?? st.itemId}.`, 'loot');
    st.count -= added;
    if (st.count <= 0) bag.items.splice(i, 1);
    else full = true;
  }
  if (full) warnThrottled(w, 'invfull', 'Mochila cheia! Venda ou descarte itens.', 1500);
  if (!bag.items.length && bag.gold <= 0) {
    w.lootBags.delete(bag.id);
    if (w.ui.lootId === bag.id) w.ui.lootId = nearbyLootBags(w)[0]?.id ?? null;
  }
  w.events.emit('lootChanged', { containerId });
  w.events.emit('itemsChanged', {});
}

/** Sacos de loot sob o jogador e nos 8 tiles ao redor (mais próximos primeiro). */
export function nearbyLootBags(w: World): LootContainer[] {
  const p = w.player;
  return [...w.lootBags.values()]
    .filter((b) => Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)) <= 1)
    .sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)));
}

/** Pega tudo de todos os sacos ao alcance; o que não couber continua no respectivo saco. */
export function takeAllNearbyLoot(w: World): void {
  for (const bag of nearbyLootBags(w)) takeLoot(w, bag.id, 'all');
}

/** Pega só o ouro de todos os sacos ao alcance. */
export function takeNearbyGold(w: World): void {
  for (const bag of nearbyLootBags(w)) if (bag.gold > 0) takeLoot(w, bag.id, -1);
}

/** Descarta itens da mochila (somem — sem itens no chão no MVP). */
export function discardItem(w: World, index: number): void {
  const st = w.player.character.inventory[index];
  if (!st) return;
  removeAt(w.player.character.inventory, index, st.count);
  message(w, `Descartado: ${w.data.items[st.itemId]?.name}.`, 'info');
  w.events.emit('itemsChanged', {});
}
