import { describe, expect, it } from 'vitest';
import { GAME_DATA as D } from '../../src/data';
import { HOTBAR_SIZE, assignHotbar, defaultHotbar, normalizeHotbar, parseHotbarEntry } from '../../src/domain/rules/hotbar';

describe('atalhos personalizáveis', () => {
  it('padrão: magias da vocação + poções automáticas de vida e mana', () => {
    const hb = defaultHotbar(D, 'sorcerer');
    expect(hb).toHaveLength(HOTBAR_SIZE);
    expect(HOTBAR_SIZE).toBe(8);
    expect(hb.slice(0, 6)).toEqual(D.vocations.sorcerer.spells.slice(0, 6).map((id) => `spell:${id}`));
    expect(hb.slice(6)).toEqual(['potion:health', 'potion:mana']);
  });

  it('save antigo (só ids de magia) vira o formato novo sem perder as magias', () => {
    const hb = normalizeHotbar(D, 'knight', ['steel_whirlwind', 'brutal_strike']);
    // as magias da vocação que faltam na barra ocupam os atalhos novos (7 e 8)
    expect(hb).toEqual(['spell:steel_whirlwind', 'spell:brutal_strike', '', '', 'potion:health', 'potion:mana', 'spell:iron_roar', 'spell:light_heal']);
  });

  it('descarta entradas inválidas (magia de outra vocação, item sem uso, lixo)', () => {
    const hb = normalizeHotbar(D, 'knight', ['spell:arcane_bolt', 'item:sword_iron', 'item:potion_health', 'xyz:1', 42, 'potion:mana']);
    expect(hb.slice(0, 6)).toEqual(['', '', 'item:potion_health', '', '', 'potion:mana']);
  });

  it('barra antiga de 6 atalhos: mantém tudo e as magias novas entram nos atalhos 7 e 8', () => {
    const old = [...D.vocations.druid.spells.slice(0, 4).map((id) => `spell:${id}`), 'potion:health', 'potion:mana'];
    const hb = normalizeHotbar(D, 'druid', old);
    expect(hb.slice(0, 6)).toEqual(old);
    expect(hb.slice(6)).toEqual(['spell:mana_shield', 'spell:haste']);
  });

  it('vincular algo que já está em outro atalho troca os dois de lugar', () => {
    const hb = defaultHotbar(D, 'druid');
    const first = hb[0];
    assignHotbar(hb, 0, { kind: 'potion', id: 'health' });
    expect(hb[0]).toBe('potion:health');
    expect(hb[6]).toBe(first); // a poção estava no 7º atalho: trocam de lugar
    assignHotbar(hb, 3, null);
    expect(hb[3]).toBe('');
    expect(parseHotbarEntry('brutal_strike')).toEqual({ kind: 'spell', id: 'brutal_strike' });
  });
});
