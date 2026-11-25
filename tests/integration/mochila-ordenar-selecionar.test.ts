// Mochila: ordenar por tipo e por valor (o mesmo botão inverte) e ações em vários itens (travar e jogar no chão).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { sortInventory } from '../../src/domain/rules/inventory';
import { isSellLocked as isLocked } from '../../src/domain/rules/economy';
import type { Inventory } from '../../src/domain/rules/inventory';
import { makeSim } from '../helpers';

const ids = (inv: Inventory) => inv.filter(Boolean).map((s) => s!.itemId);

function bag(): Inventory {
  const inv: Inventory = Array.from({ length: 10 }, () => null);
  inv[1] = { itemId: 'slime_gel', count: 4 }; // loot, 5
  inv[3] = { itemId: 'potion_mana', count: 2 }; // poção, 34 no jogo
  inv[4] = { itemId: 'axe_hand', count: 1 }; // arma, 95
  inv[6] = { itemId: 'potion_health', count: 3 }; // poção, 40
  inv[8] = { itemId: 'sword_short', count: 1 }; // arma, 60
  inv[9] = { itemId: 'slime_gel', count: 2 }; // pilha incompleta do mesmo item
  return inv;
}

describe('ordenar a mochila', () => {
  it('por valor: crescente do mais barato ao mais caro e, invertido, do mais caro ao mais barato', () => {
    const inv = bag();
    sortInventory(GAME_DATA, inv, 'value', 'asc');
    expect(ids(inv)).toEqual(['slime_gel', 'potion_mana', 'potion_health', 'sword_short', 'axe_hand']);
    sortInventory(GAME_DATA, inv, 'value', 'desc');
    expect(ids(inv)).toEqual(['axe_hand', 'sword_short', 'potion_health', 'potion_mana', 'slime_gel']);
  });

  it('por tipo: armas, poções e loot (invertido: loot primeiro); dentro do tipo, o mais valioso antes', () => {
    const inv = bag();
    sortInventory(GAME_DATA, inv, 'type', 'asc');
    expect(ids(inv)).toEqual(['axe_hand', 'sword_short', 'potion_health', 'potion_mana', 'slime_gel']);
    sortInventory(GAME_DATA, inv, 'type', 'desc');
    expect(ids(inv)).toEqual(['slime_gel', 'potion_health', 'potion_mana', 'axe_hand', 'sword_short']);
  });

  it('junta as pilhas, tira os espaços vazios e não perde nem cria itens', () => {
    const inv = bag();
    sortInventory(GAME_DATA, inv, 'value', 'asc');
    expect(inv[0]).toEqual({ itemId: 'slime_gel', count: 6 });
    expect(inv.length).toBe(10);
    expect(inv.slice(5).every((s) => s === null)).toBe(true);
  });
});

describe('vários itens de uma vez', () => {
  it('joga os marcados no chão num saco só e deixa o resto onde estava', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    const inv = w.player.character.inventory;
    inv.fill(null);
    inv[0] = { itemId: 'slime_gel', count: 4 };
    inv[1] = { itemId: 'potion_health', count: 3 };
    inv[2] = { itemId: 'axe_hand', count: 1 };
    const before = w.lootBags.size;
    sim.dropMany([0, 2, 2]);
    expect(inv[0]).toBeNull();
    expect(inv[2]).toBeNull();
    expect(inv[1]).toEqual({ itemId: 'potion_health', count: 3 });
    expect(w.lootBags.size).toBe(before + 1);
    const dropped = [...w.lootBags.values()].find((b) => b.dropped)!;
    expect(dropped.items.map((s) => s.itemId).sort()).toEqual(['axe_hand', 'slime_gel']);
  });

  it('trava e destrava a venda de vários itens (ignora o que não tem valor)', () => {
    const sim = makeSim('knight');
    const c = sim.world.player.character;
    sim.setSellLocks(['slime_gel', 'axe_hand', 'item_que_nao_existe'], true);
    expect(isLocked(c, 'slime_gel')).toBe(true);
    expect(isLocked(c, 'axe_hand')).toBe(true);
    expect(isLocked(c, 'item_que_nao_existe')).toBe(false);
    sim.setSellLocks(['slime_gel', 'axe_hand'], false);
    expect(isLocked(c, 'slime_gel')).toBe(false);
    expect(isLocked(c, 'axe_hand')).toBe(false);
  });
});
