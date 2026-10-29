// Ações de inventário com efeitos no mundo: usar consumíveis, equipar, desequipar, coletar loot.
import type { EquipSlot } from '../../domain/entities/definitions';
import { POTION, isReady, startCooldown } from '../../domain/rules/cooldowns';
import { EQUIP_FAIL_MESSAGE, equipFromInventory, unequip } from '../../domain/rules/equipment';
import { addItem, removeAt } from '../../domain/rules/inventory';
import type { World } from '../simulation/World';
import type { LootContainer } from '../entities/types';
import { message, nextId, warnThrottled } from '../simulation/World';
import { xpReceivers } from '../social/social';
import type { PlayerEntity } from '../entities/types';
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
    warnThrottled(
      w,
      `equip:${res.reason}`,
      res.reason === 'level' ? `Requer nível ${res.detail}.` : EQUIP_FAIL_MESSAGE[res.reason],
      600,
    );
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
/**
 * Loot dividido no grupo: cada membro perto e vivo recebe a mesma parte (ouro e cada item); o que sobra da
 * divisão (resto) fica com quem pegou. Quem não cabe na mochila deixa o excedente no saco para o próximo.
 */
function splitWithParty(w: World, bag: LootContainer, which: number | 'all'): void {
  const picker = w.player;
  const members = xpReceivers(w, picker.id, bag).filter((m) => m.id !== picker.id);
  if (!members.length) return;
  const n = members.length + 1;
  const share = (total: number) => Math.floor(total / n);
  const give = (m: PlayerEntity, itemId: string, count: number) => {
    const got = addItem(w.data, m.character.inventory, itemId, count);
    if (got > 0 && m === w.human)
      message(w, `Dividido do grupo: ${got}x ${w.data.items[itemId]?.name ?? itemId}.`, 'loot');
    if (m !== w.human) w.human.scope.events.emit('heroSaveRequested', { heroId: m.id, reason: 'loot' });
    return got;
  };
  // ouro: a parte de cada um; o resto fica no saco (vai com quem pegou)
  if (bag.gold > 0 && (which === 'all' || which === -1)) {
    const g = share(bag.gold);
    for (const m of members) {
      if (!g) break;
      m.character.gold += g;
      bag.gold -= g;
      if (m === w.human) message(w, `Dividido do grupo: +${g} de ouro.`, 'loot');
      if (m !== w.human) w.human.scope.events.emit('heroSaveRequested', { heroId: m.id, reason: 'loot' });
    }
  }
  // itens: cada item do saco (ou o escolhido) é repartido; a sobra da divisão continua no saco
  const indices = which === 'all' ? bag.items.map((_, i) => i) : which >= 0 ? [which] : [];
  for (const i of indices) {
    const st = bag.items[i];
    if (!st) continue;
    const per = share(st.count);
    if (per <= 0) continue;
    for (const m of members) {
      if (st.count < per) break;
      const got = give(m, st.itemId, per);
      st.count -= got;
    }
  }
  // (sem remover aqui: `takeLoot` usa os índices e apaga os sacos vazios)
}

export function takeLoot(w: World, containerId: string, which: number | 'all'): void {
  const bag = w.lootBags.get(containerId);
  const c = w.player.character;
  if (!bag) return;
  // sem trava: qualquer um pega qualquer saco a qualquer momento. Só não divide com o grupo o que você mesmo jogou
  // no chão e o saco do seu próprio corpo; o saco de morte de outro personagem é dividido como um loot comum
  if (!bag.dropped && bag.ownerId !== w.player.id) splitWithParty(w, bag, which);
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

/**
 * Joga o item da mochila no chão, embaixo do personagem: vira (ou entra em) um saco no mesmo tile; jogar mais
 * itens no mesmo lugar vai somando no mesmo saco. Dá para pegar de volta pela janela de loot.
 */
export function dropItem(w: World, index: number): void {
  const p = w.player;
  const st = p.character.inventory[index];
  if (!st || p.dead) return;
  const def = w.data.items[st.itemId];
  let bag = [...w.lootBags.values()].find((b) => b.dropped && b.x === p.x && b.y === p.y);
  if (!bag) {
    const id = nextId(w, 'loot');
    bag = {
      id,
      x: p.x,
      y: p.y,
      items: [],
      gold: 0,
      expiresAt: w.now + w.data.balance.world.lootDecayMs,
      sourceName: 'Item no chão',
      dropped: true,
    };
    w.lootBags.set(id, bag);
    w.events.emit('lootDropped', { containerId: id, position: { x: p.x, y: p.y } });
  }
  let left = st.count;
  const max = def?.maxStack ?? 1;
  for (const s of bag.items) {
    if (s.itemId !== st.itemId || s.count >= max) continue;
    const room = Math.min(left, max - s.count);
    s.count += room;
    left -= room;
  }
  while (left > 0) {
    const n = Math.min(left, max);
    bag.items.push({ itemId: st.itemId, count: n });
    left -= n;
  }
  bag.expiresAt = w.now + w.data.balance.world.lootDecayMs;
  removeAt(p.character.inventory, index, st.count);
  message(w, `Jogado no chão: ${st.count > 1 ? `${st.count}x ` : ''}${def?.name ?? st.itemId}.`, 'info');
  w.events.emit('lootChanged', { containerId: bag.id });
  w.events.emit('itemsChanged', {});
  w.events.emit('saveRequested', { reason: 'equipment' });
}
