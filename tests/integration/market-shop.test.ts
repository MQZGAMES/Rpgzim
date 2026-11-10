import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { addItem, countItem } from '../../src/domain/rules/inventory';
import { shopPrices } from '../../src/domain/rules/market';
import { makeSim } from '../helpers';

describe('shop trading from market', () => {
  const itemId = Object.keys(GAME_DATA.items).find((id) => {
    const p = shopPrices(GAME_DATA, id);
    return p.sells !== null && p.buys !== null;
  })!;
  it('requires the broker and rejects invalid quantities without charging', () => {
    const sim = makeSim();
    const c = sim.world.player.character;
    c.gold = 100000;
    expect(sim.marketShopTrade('buy', itemId, 1)).toBe(false);
    sim.world.ui.market = true as never;
    for (const qty of [0, -1, 1.5, NaN, 1001]) expect(sim.marketShopTrade('buy', itemId, qty)).toBe(false);
    expect(c.gold).toBe(100000);
  });
  it('buys with bank gold and sells from depot at authoritative shop prices', () => {
    const sim = makeSim();
    sim.world.ui.market = true as never;
    const c = sim.world.player.character;
    const prices = shopPrices(GAME_DATA, itemId);
    c.gold = 0;
    c.bankGold = 100000;
    const before = countItem(c.inventory, itemId);
    expect(sim.marketShopTrade('buy', itemId, 1)).toBe(true);
    expect(c.bankGold).toBe(100000 - prices.sells!);
    expect(countItem(c.inventory, itemId)).toBe(before + 1);
    addItem(GAME_DATA, c.depot, itemId, 1);
    const owned = countItem(c.inventory, itemId) + countItem(c.depot, itemId);
    expect(sim.marketShopTrade('sell', itemId, owned)).toBe(true);
    expect(c.gold).toBe(owned * prices.buys!);
    expect(countItem(c.depot, itemId)).toBe(0);
    expect(sim.marketShopTrade('sell', itemId, 1)).toBe(false);
  });
});
