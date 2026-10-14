// Comércio com NPCs: aplica as regras de economia e publica feedback.
import { TRADE_FAIL_MESSAGE, buy, sell } from '../../domain/rules/economy';
import type { World } from '../simulation/World';
import { message, warnThrottled } from '../simulation/World';

function openShop(w: World) {
  const s = w.ui.shop;
  return s ? w.data.shops[s.shopId] ?? null : null;
}

export function buyItem(w: World, itemId: string, quantity: number): boolean {
  const shop = openShop(w);
  if (!shop) return false;
  const c = w.player.character;
  const res = buy(w.data, c, shop, itemId, quantity);
  if (!res.ok) {
    warnThrottled(w, `buy:${res.reason}`, TRADE_FAIL_MESSAGE[res.reason], 500);
    return false;
  }
  message(w, `Comprou ${quantity}x ${w.data.items[itemId]?.name} por ${res.total} de ouro.`, 'loot');
  w.events.emit('goldChanged', { amount: c.gold, delta: -res.total });
  w.events.emit('itemsChanged', {});
  w.events.emit('saveRequested', { reason: 'trade' });
  return true;
}

export function sellItem(w: World, itemId: string, quantity: number): boolean {
  const shop = openShop(w);
  if (!shop) return false;
  const c = w.player.character;
  const res = sell(c, shop, itemId, quantity);
  if (!res.ok) {
    warnThrottled(w, `sell:${res.reason}`, TRADE_FAIL_MESSAGE[res.reason], 500);
    return false;
  }
  message(w, `Vendeu ${quantity}x ${w.data.items[itemId]?.name} por ${res.total} de ouro.`, 'loot');
  w.events.emit('goldChanged', { amount: c.gold, delta: res.total });
  w.events.emit('itemsChanged', {});
  w.events.emit('saveRequested', { reason: 'trade' });
  return true;
}
