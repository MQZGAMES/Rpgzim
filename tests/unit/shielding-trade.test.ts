import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { newShieldTraining, shieldingTryCounts } from '../../src/domain/rules/shielding';
import { sellAll, sellAllPreview } from '../../src/domain/rules/economy';
import { trainSkill } from '../../src/domain/rules/skills';

const D = GAME_DATA;
const cfg = D.balance.combat;

describe('treino de Shielding (estilo Tibia)', () => {
  it('conta no máximo 2 atacantes por janela, uma vez cada', () => {
    const st = newShieldTraining();
    const now = 10_000;
    expect(shieldingTryCounts(st, now, 'a', true, now - 100, cfg)).toBe(true);
    expect(shieldingTryCounts(st, now + 100, 'a', true, now, cfg)).toBe(false); // mesmo atacante
    expect(shieldingTryCounts(st, now + 200, 'b', true, now, cfg)).toBe(true);
    expect(shieldingTryCounts(st, now + 300, 'c', true, now, cfg)).toBe(false); // terceiro monstro
    // nova janela
    expect(shieldingTryCounts(st, now + cfg.shieldingWindowMs, 'c', true, now + 1500, cfg)).toBe(true);
  });
  it('exige escudo e que o personagem tenha atacado recentemente', () => {
    const st = newShieldTraining();
    expect(shieldingTryCounts(st, 10_000, 'a', false, 9_900, cfg)).toBe(false);
    expect(shieldingTryCounts(st, 10_000, 'a', true, 10_000 - cfg.shieldingAttackWindowMs - 1, cfg)).toBe(false);
    expect(shieldingTryCounts(st, 10_000, 'a', true, -Infinity, cfg)).toBe(false);
  });
  it('Knight evolui mais rápido que Paladin, que evolui mais rápido que os magos', () => {
    const triesToReach = (voc: 'knight' | 'paladin' | 'sorcerer' | 'druid', target: number) => {
      let s = { level: 10, tries: 0 };
      let n = 0;
      while (s.level < target) {
        s = trainSkill('shielding', s, 1, D.vocations[voc].skillMultipliers.shielding, D.balance).state;
        n++;
      }
      return n;
    };
    const k = triesToReach('knight', 25);
    const p = triesToReach('paladin', 25);
    const m = triesToReach('sorcerer', 25);
    expect(k).toBeLessThan(p);
    expect(p).toBeLessThan(m);
    expect(triesToReach('druid', 25)).toBe(m);
  });
});

describe('vender tudo', () => {
  it('vende só o que a loja compra e nunca o equipado', () => {
    const c = createCharacter(D, { id: 'h', name: 'Aria', vocation: 'knight', now: 0, position: { x: 0, y: 0 } });
    c.inventory = c.inventory.map(() => null);
    c.inventory[0] = { itemId: 'boar_hide', count: 3 };
    c.inventory[1] = { itemId: 'goblin_ear', count: 2 };
    c.inventory[2] = { itemId: 'potion_health', count: 5 };
    c.inventory[3] = { itemId: 'slime_gel', count: 4 };
    const shop = D.shops.general!;
    const preview = sellAllPreview(c, shop);
    const expected = preview.reduce((s, o) => s + o.total, 0);
    const gold = c.gold;
    const sword = c.equipment.mainHand?.itemId;
    const res = sellAll(c, shop);
    expect(res.total).toBe(expected);
    expect(res.units).toBe(3 + 2 + 4);
    expect(c.gold).toBe(gold + expected);
    expect(c.inventory.filter(Boolean).map((s) => s!.itemId)).toEqual(['potion_health']);
    expect(c.equipment.mainHand?.itemId).toBe(sword);
  });
});
