// Ações de inventário com efeitos no mundo: usar consumíveis, equipar, desequipar, coletar loot.
import type { EquipSlot } from '../../domain/entities/definitions';
import { POTION, isReady, startCooldown } from '../../domain/rules/cooldowns';
import { EQUIP_FAIL_MESSAGE, equipFromInventory, unequip } from '../../domain/rules/equipment';
import { addItem, maxStackOf, removeAt } from '../../domain/rules/inventory';
import type { World } from '../simulation/World';
import type { LootContainer } from '../entities/types';
import { message, nextId, warnThrottled } from '../simulation/World';
import { actorById } from '../social/social';
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
  // poções têm nível mínimo (as pequenas servem para todos)
  if (def.minLevel && c.level < def.minLevel) {
    warnThrottled(w, 'potionlvl', `${def.name}: requer nível ${def.minLevel}.`, 1000);
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

/** Valor de venda de uma unidade: o melhor preço que uma loja paga (sem loja, o valor de referência do item). */
export function lootUnitValue(w: World, itemId: string): number {
  let best = 0;
  for (const shop of Object.values(w.data.shops)) for (const o of shop.buys) if (o.itemId === itemId && o.price > best) best = o.price;
  return best || (w.data.items[itemId]?.value ?? 0);
}

/**
 * Saco de criatura morta pelo grupo: o ouro é dividido igualmente entre quem estava perto no abate (o resto da divisão
 * fica com quem tem a vez) e os itens vão inteiros para quem tem a vez no rodízio, não importa quem abriu o saco. O que
 * não couber na mochila dele (ou se ele saiu do mundo/morreu) fica para quem está pegando.
 */
function deliverPartyLoot(w: World, bag: LootContainer, which: number | 'all'): void {
  const share = bag.party!;
  const picker = w.player;
  const alive = (id: string) => {
    const a = actorById(w, id);
    return a && !a.dead ? a : null;
  };
  const notifySave = (m: PlayerEntity) => {
    if (m !== w.human) w.human.scope.events.emit('heroSaveRequested', { heroId: m.id, reason: 'loot' });
  };
  const owner = alive(share.lootTo) ?? picker;
  if (bag.gold > 0 && (which === 'all' || which === -1)) {
    const members = share.shareIds.map(alive).filter((a): a is PlayerEntity => !!a);
    if (!members.includes(picker)) members.push(picker);
    const per = Math.floor(bag.gold / members.length);
    let rest = bag.gold - per * members.length;
    for (const m of members) {
      const g = per + (m === owner ? rest : 0);
      if (m === owner) rest = 0;
      if (g <= 0) continue;
      m.character.gold += g;
      if (m === w.human) message(w, `+${g} de ouro (dividido no grupo).`, 'loot');
      if (m === picker) w.events.emit('goldChanged', { amount: m.character.gold, delta: g });
      notifySave(m);
    }
    bag.gold = 0;
  }
  if (owner === picker) return; // os itens seguem o caminho normal da coleta
  const indices = which === 'all' ? bag.items.map((_, i) => i) : which >= 0 ? [which] : [];
  for (const i of indices) {
    const st = bag.items[i];
    if (!st) continue;
    const name = w.data.items[st.itemId]?.name ?? st.itemId;
    const got = addItem(w.data, owner.character.inventory, st.itemId, st.count);
    if (got <= 0) continue;
    st.count -= got;
    if (owner === w.human) message(w, `Loot do grupo (sua vez): ${got}x ${name}.`, 'loot');
    else if (picker === w.human) message(w, `${got}x ${name} foi para ${owner.character.name} (vez dele no loot).`, 'loot');
    notifySave(owner);
  }
  // pilhas entregues (count 0) saem do saco no fim de `takeLoot`; a sobra (mochila do dono cheia) fica para quem pega
}

/** Coleta itens de um saco de loot: índice específico ou tudo ('all'). Ouro vai direto para a bolsa. */
export function takeLoot(w: World, containerId: string, which: number | 'all'): void {
  const bag = w.lootBags.get(containerId);
  const c = w.player.character;
  if (!bag || w.player.dead || Math.max(Math.abs(bag.x - w.player.x), Math.abs(bag.y - w.player.y)) > 1) return;
  // sem trava: qualquer um pega qualquer saco a qualquer momento. Loot de criatura morta pelo grupo segue o rodízio
  // (ouro dividido, itens para quem tem a vez); saco de morte de personagem e itens jogados no chão: quem pegar leva tudo
  if (bag.party && !bag.dropped) deliverPartyLoot(w, bag, which);
  if (bag.gold > 0 && (which === 'all' || which === -1)) {
    c.gold += bag.gold;
    w.events.emit('goldChanged', { amount: c.gold, delta: bag.gold });
    message(w, `+${bag.gold} de ouro.`, 'loot');
    bag.gold = 0;
  }
  // pegar tudo: as pilhas mais valiosas primeiro (se a mochila encher, fica para trás o que vale menos)
  const stacks =
    which === 'all'
      ? [...bag.items].sort((a, b) => lootUnitValue(w, b.itemId) * b.count - lootUnitValue(w, a.itemId) * a.count)
      : which >= 0 && bag.items[which]
        ? [bag.items[which]!]
        : [];
  let full = false;
  for (const st of stacks) {
    if (st.count <= 0) continue;
    const added = addItem(w.data, c.inventory, st.itemId, st.count);
    if (added > 0) message(w, `Coletado: ${added}x ${w.data.items[st.itemId]?.name ?? st.itemId}.`, 'loot');
    st.count -= added;
    if (st.count > 0) full = true;
  }
  bag.items = bag.items.filter((st) => st.count > 0);
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

/**
 * Pega tudo dos sacos ao alcance (filtro opcional): primeiro o ouro, depois as pilhas de maior valor de venda, de
 * qualquer saco; com a mochila cheia, o que vale menos fica no chão.
 */
export function takeAllNearbyLoot(w: World, accept: (bag: LootContainer) => boolean = () => true): void {
  const bags = nearbyLootBags(w).filter(accept);
  for (const bag of bags) if (bag.gold > 0) takeLoot(w, bag.id, -1);
  const stacks = bags
    .flatMap((bag) => bag.items.map((st) => ({ bag, st, value: lootUnitValue(w, st.itemId) * st.count })))
    .sort((a, b) => b.value - a.value);
  for (const { bag, st } of stacks) {
    const i = bag.items.indexOf(st);
    if (i >= 0 && w.lootBags.has(bag.id)) takeLoot(w, bag.id, i);
  }
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
  const max = def?.stackable ? maxStackOf(w.data, st.itemId) : 1;
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
