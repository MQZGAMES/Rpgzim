import { describe, expect, it } from 'vitest';
import { takeLoot } from '../../src/game/inventory/inventoryService';
import { countItem } from '../../src/domain/rules/inventory';
import { makeSim } from '../helpers';

function setup(distance: number) {
  const w = makeSim().world;
  const p = w.human;
  p.character.inventory.fill(null);
  const bag = {
    id: 'review-loot',
    x: p.x + distance,
    y: p.y,
    items: [{ itemId: 'wolf_pelt', count: 3 }],
    gold: 50,
    expiresAt: Infinity,
    ownerId: p.id,
    sourceName: 'Review loot',
  };
  w.lootBags.set(bag.id, bag);
  return { w, p, bag };
}

describe('loot action validation', () => {
  it.each([2, 20])('does not collect from a bag %i tiles away, even with a stale open window', (distance) => {
    const { w, p, bag } = setup(distance);
    w.ui.lootId = bag.id;
    const before = structuredClone(p.character);
    takeLoot(w, bag.id, 'all');
    expect(p.character).toEqual(before);
    expect(bag.gold).toBe(50);
    expect(bag.items[0]!.count).toBe(3);
  });
  it('does not let a dead character recover their loot', () => {
    const { w, p, bag } = setup(0);
    p.dead = true;
    const gold = p.character.gold;
    takeLoot(w, bag.id, 'all');
    expect(p.character.gold).toBe(gold);
    expect(bag.gold).toBe(50);
    expect(countItem(p.character.inventory, 'wolf_pelt')).toBe(0);
  });
  it('keeps adjacent collection working', () => {
    const { w, p, bag } = setup(1);
    const gold = p.character.gold;
    takeLoot(w, bag.id, 'all');
    expect(p.character.gold).toBe(gold + 50);
    expect(countItem(p.character.inventory, 'wolf_pelt')).toBe(3);
    expect(w.lootBags.has(bag.id)).toBe(false);
  });
});
