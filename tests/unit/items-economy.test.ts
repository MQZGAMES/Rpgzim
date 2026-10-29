import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { addItem, canFit, countItem, freeSlots, removeItem } from '../../src/domain/rules/inventory';
import { equipFromInventory, unequip } from '../../src/domain/rules/equipment';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { buy, sell, sellAllPreview } from '../../src/domain/rules/economy';
import { computeStats } from '../../src/domain/rules/stats';
import { rollLoot } from '../../src/domain/rules/loot';
import { fixedRng, createRng } from '../../src/domain/value-objects/rng';
import type { VocationId } from '../../src/domain/value-objects/ids';

const D = GAME_DATA;
const char = (v: VocationId = 'knight') => createCharacter(D, { id: 'x', name: 'Tester', vocation: v, now: 0, position: { x: 1, y: 1 } });

describe('inventário', () => {
  it('empilha itens empilháveis e respeita o limite da pilha', () => {
    const inv = new Array(3).fill(null);
    expect(addItem(D, inv, 'arrow', 150)).toBe(150);
    expect(inv[0]).toEqual({ itemId: 'arrow', count: 100 });
    expect(inv[1]).toEqual({ itemId: 'arrow', count: 50 });
    expect(addItem(D, inv, 'arrow', 30)).toBe(30);
    expect(countItem(inv, 'arrow')).toBe(180);
  });
  it('itens não empilháveis ocupam um espaço cada e a capacidade é respeitada', () => {
    const inv = new Array(2).fill(null);
    expect(addItem(D, inv, 'sword_short', 3)).toBe(2);
    expect(freeSlots(inv)).toBe(0);
    expect(canFit(D, inv, 'potion_health', 1)).toBe(false);
  });
  it('remove quantidades parciais', () => {
    const inv = new Array(4).fill(null);
    addItem(D, inv, 'potion_health', 5);
    expect(removeItem(inv, 'potion_health', 2)).toBe(2);
    expect(countItem(inv, 'potion_health')).toBe(3);
    expect(removeItem(inv, 'potion_health', 10)).toBe(3);
    expect(freeSlots(inv)).toBe(4);
  });
});

describe('equipamentos e atributos', () => {
  it('equipar atualiza atributos imediatamente e devolve o item anterior à mochila', () => {
    const c = char('knight');
    const before = computeStats(D, c);
    expect(before.weapon.itemId).toBe('sword_short');
    const axeIdx = c.inventory.findIndex((s) => s?.itemId === 'axe_hand');
    expect(equipFromInventory(D, c, axeIdx)).toEqual({ ok: true, slot: 'mainHand' });
    const after = computeStats(D, c);
    expect(after.weapon.itemId).toBe('axe_hand');
    expect(after.weapon.skill).toBe('axe');
    expect(countItem(c.inventory, 'sword_short')).toBe(1);
  });
  it('bloqueia itens de outra vocação e de nível superior', () => {
    const c = char('sorcerer');
    addItem(D, c.inventory, 'armor_chain', 1);
    addItem(D, c.inventory, 'wand_storm', 1);
    expect(equipFromInventory(D, c, c.inventory.findIndex((s) => s?.itemId === 'armor_chain'))).toMatchObject({ ok: false, reason: 'vocation' });
    expect(equipFromInventory(D, c, c.inventory.findIndex((s) => s?.itemId === 'wand_storm'))).toMatchObject({ ok: false, reason: 'level' });
  });
  it('arma de duas mãos remove o escudo para a mochila', () => {
    const c = char('knight');
    c.level = 10;
    addItem(D, c.inventory, 'axe_battle', 1);
    const res = equipFromInventory(D, c, c.inventory.findIndex((s) => s?.itemId === 'axe_battle'));
    expect(res.ok).toBe(true);
    expect(c.equipment.offHand).toBeUndefined();
    expect(countItem(c.inventory, 'shield_wood')).toBe(1);
    expect(computeStats(D, c).shieldDefense).toBe(0);
  });
  it('não equipa se a mochila não comportar o item devolvido (operação atômica)', () => {
    const c = char('knight');
    c.level = 10;
    c.inventory.fill(null);
    c.inventory[0] = { itemId: 'axe_battle', count: 1 };
    for (let i = 1; i < c.inventory.length; i++) c.inventory[i] = { itemId: 'dagger', count: 1 };
    // espada e escudo precisariam de 2 espaços; só 1 é liberado
    expect(equipFromInventory(D, c, 0)).toMatchObject({ ok: false, reason: 'inventoryFull' });
    expect(c.equipment.mainHand?.itemId).toBe('sword_short');
    expect(c.inventory[0]?.itemId).toBe('axe_battle');
  });
  it('bônus de acessórios aumentam vida e mana máximas', () => {
    const c = char('druid');
    const base = computeStats(D, c);
    addItem(D, c.inventory, 'ring_vigor', 1);
    addItem(D, c.inventory, 'amulet_mana', 1);
    equipFromInventory(D, c, c.inventory.findIndex((s) => s?.itemId === 'ring_vigor'));
    equipFromInventory(D, c, c.inventory.findIndex((s) => s?.itemId === 'amulet_mana'));
    const s = computeStats(D, c);
    expect(s.maxHealth).toBe(base.maxHealth + 25);
    expect(s.maxMana).toBe(base.maxMana + 40);
  });
  it('desequipar devolve à mochila', () => {
    const c = char('knight');
    expect(unequip(D, c, 'offHand').ok).toBe(true);
    expect(countItem(c.inventory, 'shield_wood')).toBe(1);
    expect(unequip(D, c, 'offHand')).toMatchObject({ ok: false, reason: 'empty' });
  });
  it('compra com o ouro da mochila primeiro e completa com o do banco', () => {
    const shop = D.shops.equipment!;
    const price = shop.sells.find((o) => o.itemId === 'shield_wood')!.price;
    const c = char('knight');
    c.gold = price; // só dá para 1 na mochila
    c.bankGold = price * 2;
    // 3 escudos: a mochila paga 1 e o banco 2
    expect(buy(D, c, shop, 'shield_wood', 3)).toEqual({ ok: true, total: price * 3, fromBank: price * 2 });
    expect(c.gold).toBe(0);
    expect(c.bankGold).toBe(0);
    // só da mochila: nada sai do banco
    const d = char('knight');
    d.gold = price * 5;
    d.bankGold = 999;
    expect(buy(D, d, shop, 'shield_wood', 2)).toEqual({ ok: true, total: price * 2 });
    expect(d.gold).toBe(price * 3);
    expect(d.bankGold).toBe(999);
    // mochila + banco insuficientes: recusa sem mexer em nada
    const e = char('knight');
    e.gold = price - 1;
    e.bankGold = 0;
    expect(buy(D, e, shop, 'shield_wood', 1)).toMatchObject({ ok: false, reason: 'notEnoughGold' });
    expect(e.gold).toBe(price - 1);
  });
  it('o paladino começa sem flechas: o arco não gasta munição', () => {
    const c = char('paladin');
    expect(c.equipment).not.toHaveProperty('ammo');
    expect(countItem(c.inventory, 'arrow')).toBe(0);
    expect(D.items.bow_hunting!.weapon).not.toHaveProperty('ammo');
  });
  it('o save antigo com flechas equipadas no slot de munição as devolve para a mochila', () => {
    const c = char('paladin');
    c.inventory.fill(null);
    const raw = JSON.parse(JSON.stringify(toSaveFile(c)));
    raw.character.equipment.ammo = { itemId: 'arrow', count: 60 };
    const back = parseSave(D, raw).character;
    expect(back.equipment).not.toHaveProperty('ammo');
    expect(countItem(back.inventory, 'arrow')).toBe(60);
  });
});

describe('compra e venda', () => {
  const shop = D.shops['equipment']!;
  it('compra desconta o ouro e adiciona o item', () => {
    const c = char();
    c.gold = 200;
    expect(buy(D, c, shop, 'shield_wood', 2)).toEqual({ ok: true, total: 90 });
    expect(c.gold).toBe(110);
    expect(countItem(c.inventory, 'shield_wood')).toBe(2);
  });
  it('rejeita ouro insuficiente, item não vendido e quantidade inválida sem alterar o estado', () => {
    const c = char();
    c.gold = 10;
    const inv = JSON.stringify(c.inventory);
    expect(buy(D, c, shop, 'sword_iron', 1)).toMatchObject({ ok: false, reason: 'notEnoughGold' });
    expect(buy(D, c, shop, 'potion_health', 1)).toMatchObject({ ok: false, reason: 'notSold' });
    expect(buy(D, c, shop, 'shield_wood', 0)).toMatchObject({ ok: false, reason: 'invalidQuantity' });
    expect(c.gold).toBe(10);
    expect(JSON.stringify(c.inventory)).toBe(inv);
  });
  it('a alquimia compra poções pela metade do preço, mas o "vender tudo" não as leva', () => {
    const c = char();
    const potions = D.shops['potions']!;
    for (const o of potions.sells.filter((s) => s.itemId.startsWith('potion_')))
      expect(potions.buys.find((b) => b.itemId === o.itemId)?.price).toBe(Math.floor(o.price / 2));
    c.inventory.fill(null);
    addItem(D, c.inventory, 'potion_health', 4);
    expect(sellAllPreview(c, potions)).toEqual([]);
    const g = c.gold;
    expect(sell(c, potions, 'potion_health', 4)).toEqual({ ok: true, total: 80 });
    expect(c.gold).toBe(g + 80);
  });
  it('rejeita compra com mochila cheia', () => {
    const c = char();
    c.gold = 9999;
    c.inventory.fill({ itemId: 'dagger', count: 1 });
    expect(buy(D, c, shop, 'shield_wood', 1)).toMatchObject({ ok: false, reason: 'inventoryFull' });
    expect(c.gold).toBe(9999);
  });
  it('venda credita o ouro e remove os itens; itens não aceitos são recusados', () => {
    const c = char();
    const g = c.gold;
    const general = D.shops['general']!;
    addItem(D, c.inventory, 'boar_tusk', 3);
    expect(sell(c, general, 'boar_tusk', 2)).toEqual({ ok: true, total: 36 });
    expect(c.gold).toBe(g + 36);
    expect(countItem(c.inventory, 'boar_tusk')).toBe(1);
    expect(sell(c, general, 'boar_tusk', 5)).toMatchObject({ ok: false, reason: 'notEnoughItems' });
    expect(sell(c, general, 'sword_short', 1)).toMatchObject({ ok: false, reason: 'notBought' });
  });
});

describe('geração de loot', () => {
  const goblin = D.monsters['goblin']!;
  it('com sorte máxima todos os itens caem; com sorte mínima nada cai', () => {
    const all = rollLoot(goblin, fixedRng(0));
    expect(all.items.map((i) => i.itemId)).toEqual(goblin.loot.map((l) => l.itemId));
    expect(all.gold).toBe(goblin.gold.min);
    const none = rollLoot(goblin, fixedRng(0.9999));
    expect(none.items).toEqual([]);
    expect(none.gold).toBe(0);
  });
  it('quantidades respeitam as faixas da tabela e a frequência é coerente', () => {
    const rng = createRng(7);
    let ears = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollLoot(goblin, rng);
      for (const it of r.items) {
        const e = goblin.loot.find((l) => l.itemId === it.itemId)!;
        expect(it.count).toBeGreaterThanOrEqual(e.min);
        expect(it.count).toBeLessThanOrEqual(e.max);
        if (it.itemId === 'goblin_ear') ears++;
      }
      if (r.gold) {
        expect(r.gold).toBeGreaterThanOrEqual(goblin.gold.min);
        expect(r.gold).toBeLessThanOrEqual(goblin.gold.max);
      }
    }
    expect(ears / 2000).toBeGreaterThan(0.44);
    expect(ears / 2000).toBeLessThan(0.56);
  });
});
