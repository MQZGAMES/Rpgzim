import { describe, expect, it } from 'vitest';
import { GAME_DATA as D } from '../../src/data';
import { HOTBAR_SETS, HOTBAR_SIZE, assignHotbar, defaultHotbar, normalizeHotbar, normalizeHotbarSets, parseHotbarEntry, switchHotbarSet } from '../../src/domain/rules/hotbar';

describe('atalhos personalizáveis', () => {
  it('padrão: magias da vocação + poções automáticas de vida e mana', () => {
    const hb = defaultHotbar(D, 'sorcerer');
    expect(hb).toHaveLength(HOTBAR_SIZE);
    expect(HOTBAR_SIZE).toBe(9);
    expect(hb.slice(0, 7)).toEqual(D.vocations.sorcerer.spells.slice(0, 7).map((id) => `spell:${id}`));
    expect(hb.slice(7)).toEqual(['potion:health', 'potion:mana']);
  });

  it('save antigo (só ids de magia) vira o formato novo sem perder as magias', () => {
    const hb = normalizeHotbar(D, 'knight', ['steel_whirlwind', 'brutal_strike']);
    // as magias da vocação que faltam na barra ocupam os atalhos novos (7, 8 e 9)
    expect(hb).toEqual(['spell:steel_whirlwind', 'spell:brutal_strike', '', '', 'potion:health', 'potion:mana', 'spell:iron_roar', 'spell:light_heal', 'spell:war_cry']);
  });

  it('descarta entradas inválidas (magia de outra vocação, item sem uso, lixo)', () => {
    const hb = normalizeHotbar(D, 'knight', ['spell:arcane_bolt', 'item:sword_iron', 'item:potion_health', 'xyz:1', 42, 'potion:mana']);
    expect(hb.slice(0, 6)).toEqual(['', '', 'item:potion_health', '', '', 'potion:mana']);
  });

  it('barra antiga de 6 atalhos: mantém tudo e as magias novas entram nos atalhos 7, 8 e 9', () => {
    const old = [...D.vocations.druid.spells.slice(0, 4).map((id) => `spell:${id}`), 'potion:health', 'potion:mana'];
    const hb = normalizeHotbar(D, 'druid', old);
    expect(hb.slice(0, 6)).toEqual(old);
    expect(hb.slice(6)).toEqual(['spell:mana_shield', 'spell:haste', 'spell:conjure_health']);
  });

  it('barra de 8 atalhos (versão anterior): mantém as posições e a magia nova do Knight entra no 9', () => {
    const old = [...D.vocations.knight.spells.slice(0, 6).map((id) => `spell:${id}`), 'potion:health', 'potion:mana'];
    const hb = normalizeHotbar(D, 'knight', old);
    expect(hb.slice(0, 8)).toEqual(old);
    expect(hb[8]).toBe('spell:crippling_blow');
    const pal = normalizeHotbar(D, 'paladin', [...D.vocations.paladin.spells.slice(0, 6).map((id) => `spell:${id}`), 'potion:health', 'potion:mana']);
    expect(pal[8]).toBe('spell:divine_shot');
  });

  it('vincular algo que já está em outro atalho troca os dois de lugar', () => {
    const hb = defaultHotbar(D, 'druid');
    const first = hb[0];
    assignHotbar(hb, 0, { kind: 'potion', id: 'health' });
    expect(hb[0]).toBe('potion:health');
    expect(hb[7]).toBe(first); // a poção estava no 8º atalho: trocam de lugar
    assignHotbar(hb, 3, null);
    expect(hb[3]).toBe('');
    expect(parseHotbarEntry('brutal_strike')).toEqual({ kind: 'spell', id: 'brutal_strike' });
  });
});

describe('favoritos de atalhos (3 conjuntos)', () => {
  const fresh = () => {
    const hotbar = defaultHotbar(D, 'druid');
    return { hotbar, ...normalizeHotbarSets(D, 'druid', hotbar, undefined, undefined) };
  };

  it('save antigo (sem conjuntos): o conjunto 1 é a barra de sempre e os outros dois começam com o padrão', () => {
    const mine = ['spell:earth_thorn', '', '', '', '', '', '', 'potion:health', ''];
    const s = normalizeHotbarSets(D, 'druid', normalizeHotbar(D, 'druid', mine), undefined, undefined);
    expect(HOTBAR_SETS).toBe(3);
    expect(s.hotbarSet).toBe(0);
    expect(s.hotbarSets).toHaveLength(3);
    expect(s.hotbarSets[0]).toEqual(normalizeHotbar(D, 'druid', mine));
    expect(s.hotbarSets[1]).toEqual(defaultHotbar(D, 'druid'));
    expect(s.hotbarSets[2]).toEqual(defaultHotbar(D, 'druid'));
  });

  it('trocar guarda a barra que sai e carrega a que entra (e volta intacta)', () => {
    const c = fresh();
    c.hotbar[0] = 'potion:mana'; // edição no conjunto 1
    expect(switchHotbarSet(c, 1)).toBe(true);
    expect(c.hotbarSet).toBe(1);
    expect(c.hotbar[0]).toBe(defaultHotbar(D, 'druid')[0]); // o conjunto 2 é independente
    c.hotbar[0] = '';
    expect(switchHotbarSet(c, 2)).toBe(true);
    expect(switchHotbarSet(c, 0)).toBe(true);
    expect(c.hotbar[0]).toBe('potion:mana');
    expect(switchHotbarSet(c, 1)).toBe(true);
    expect(c.hotbar[0]).toBe('');
  });

  it('conjunto inválido ou o mesmo que já está ativo não faz nada', () => {
    const c = fresh();
    for (const bad of [-1, 3, 1.5, NaN, 0]) expect(switchHotbarSet(c, bad)).toBe(false);
    expect(c.hotbarSet).toBe(0);
  });

  it('dados corrompidos viram conjuntos válidos (índice fora da faixa, listas de lixo)', () => {
    const hotbar = defaultHotbar(D, 'knight');
    const s = normalizeHotbarSets(D, 'knight', hotbar, [42, ['spell:arcane_bolt'], 'x', 'extra'], 9);
    expect(s.hotbarSet).toBe(0);
    expect(s.hotbarSets).toHaveLength(3);
    for (const set of s.hotbarSets) expect(set).toHaveLength(HOTBAR_SIZE);
    expect(s.hotbarSets[1]).not.toContain('spell:arcane_bolt'); // magia de outra vocação é descartada
  });
});
