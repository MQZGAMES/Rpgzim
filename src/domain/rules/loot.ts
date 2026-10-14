// Geração de loot por tabela de chances, com RNG injetado (testável e reprodutível).
import type { ItemStack } from '../entities/character';
import type { MonsterDef } from '../entities/definitions';
import type { Rng } from '../value-objects/rng';

export interface LootResult {
  items: ItemStack[];
  gold: number;
}

export interface LootGenerator {
  roll(monster: MonsterDef): LootResult;
}

export function rollLoot(monster: MonsterDef, rng: Rng): LootResult {
  const items: ItemStack[] = [];
  for (const entry of monster.loot) {
    if (rng.chance(entry.chance)) items.push({ itemId: entry.itemId, count: rng.int(entry.min, entry.max) });
  }
  const gold = rng.chance(monster.gold.chance) ? rng.int(monster.gold.min, monster.gold.max) : 0;
  return { items, gold };
}

export function createLootGenerator(rng: Rng): LootGenerator {
  return { roll: (m) => rollLoot(m, rng) };
}
