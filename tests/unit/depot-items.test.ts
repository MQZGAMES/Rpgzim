import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { depositAllLoot, depositGold, depositItem, withdrawGold, withdrawItem } from '../../src/domain/rules/depot';
import { isUpgrade, itemAttack, itemDefense } from '../../src/domain/rules/itemPower';

const D = GAME_DATA;
const make = (voc: 'knight' | 'sorcerer' = 'knight') => createCharacter(D, { id: 'h', name: 'Aria', vocation: voc, now: 0, position: { x: 0, y: 0 } });

describe('banco e depósito', () => {
  it('guarda e retira itens, empilhando pilhas iguais', () => {
    const c = make();
    c.inventory[10] = { itemId: 'wolf_pelt', count: 3 };
    c.inventory[11] = { itemId: 'wolf_pelt', count: 4 };
    expect(depositItem(D, c, 10)).toEqual({ ok: true, moved: 3 });
    expect(depositItem(D, c, 11)).toEqual({ ok: true, moved: 4 });
    expect(c.inventory[10]).toBeNull();
    expect(c.depot.filter(Boolean)).toEqual([{ itemId: 'wolf_pelt', count: 7 }]);
    const idx = c.depot.findIndex((s) => s?.itemId === 'wolf_pelt');
    expect(withdrawItem(D, c, idx)).toEqual({ ok: true, moved: 7 });
    expect(c.depot.every((s) => s === null)).toBe(true);
  });

  it('não retira para a mochila cheia (o item continua guardado)', () => {
    const c = make();
    c.depot[0] = { itemId: 'sword_iron', count: 1 };
    c.inventory = c.inventory.map(() => ({ itemId: 'dagger', count: 1 }));
    expect(withdrawItem(D, c, 0)).toEqual({ ok: false, reason: 'full' });
    expect(c.depot[0]).toEqual({ itemId: 'sword_iron', count: 1 });
  });

  it('"guardar loot" mantém poções e munição na mochila', () => {
    const c = make();
    c.inventory = c.inventory.map(() => null);
    c.inventory[0] = { itemId: 'potion_health', count: 3 };
    c.inventory[1] = { itemId: 'boar_hide', count: 2 };
    c.inventory[2] = { itemId: 'arrow', count: 20 };
    c.inventory[3] = { itemId: 'mace_iron', count: 1 };
    expect(depositAllLoot(D, c)).toBe(2);
    expect(c.inventory.filter(Boolean).map((s) => s!.itemId)).toEqual(['potion_health', 'arrow']);
  });

  it('deposita e saca ouro sem aceitar valores inválidos', () => {
    const c = make();
    c.gold = 100;
    expect(depositGold(c, 60).ok).toBe(true);
    expect([c.gold, c.bankGold]).toEqual([40, 60]);
    expect(depositGold(c, 41).ok).toBe(false);
    expect(depositGold(c, -5).ok).toBe(false);
    expect(withdrawGold(c, 61).ok).toBe(false);
    expect(withdrawGold(c, 60).ok).toBe(true);
    expect([c.gold, c.bankGold]).toEqual([100, 0]);
  });
});

describe('ataque/defesa dos itens e comparação', () => {
  it('mostra o ataque das armas, o dano médio das varinhas e a defesa de armaduras e escudos', () => {
    expect(itemAttack(D.items.sword_iron!)).toBe(16);
    expect(itemAttack(D.items.wand_ember!)).toBe(11);
    expect(itemDefense(D.items.shield_iron!)).toBe(14);
    expect(itemDefense(D.items.armor_chain!)).toBe(6);
    expect(itemAttack(D.items.potion_health!)).toBeNull();
  });

  it('marca como melhor só o que a vocação pode usar agora e supera o equipado', () => {
    const k = make('knight');
    expect(isUpgrade(D, k, D.items.axe_hand!)).toBe(true); // 12 > espada curta 10
    expect(isUpgrade(D, k, D.items.club_wood!)).toBe(false);
    expect(isUpgrade(D, k, D.items.sword_iron!)).toBe(false); // requer nível 4
    k.level = 4;
    expect(isUpgrade(D, k, D.items.sword_iron!)).toBe(true);
    expect(isUpgrade(D, k, D.items.wand_ember!)).toBe(false); // outra vocação
    expect(isUpgrade(D, k, D.items.helmet_iron!)).toBe(true);
    const s = make('sorcerer');
    expect(isUpgrade(D, s, D.items.spellbook!)).toBe(true); // slot vazio
  });

  it('os equipamentos avançados cobrem todas as vocações até o nível 15+', () => {
    for (const voc of ['knight', 'paladin', 'sorcerer', 'druid'] as const) {
      const usable = Object.values(D.items).filter((i) => i.slot && (!i.vocations || i.vocations.includes(voc)));
      expect(usable.filter((i) => i.weapon && (i.minLevel ?? 1) >= 8).length, voc).toBeGreaterThanOrEqual(2);
      expect(Math.max(...usable.map((i) => i.minLevel ?? 1)), voc).toBeGreaterThanOrEqual(15);
    }
  });
});
