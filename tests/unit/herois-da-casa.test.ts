// Personagens da casa: 24 (6 de cada vocação), nomes únicos, e os novos aparecem também para quem já jogava.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { seededHeroes } from '../../src/app/heroes';

describe('personagens da casa', () => {
  it('são 24, 6 de cada vocação, com nomes e ids únicos e todas as falas', () => {
    const all = Object.values(GAME_DATA.heroes);
    expect(all).toHaveLength(24);
    for (const voc of ['knight', 'paladin', 'sorcerer', 'druid'] as const)
      expect(all.filter((h) => h.vocation === voc)).toHaveLength(6);
    expect(new Set(all.map((h) => h.name.toLowerCase())).size).toBe(24);
    expect(new Set(all.map((h) => h.slotId)).size).toBe(24);
    const keys = Object.keys(GAME_DATA.heroes.boladex!.lines);
    for (const h of all) for (const k of keys) expect(h.lines[k as keyof typeof h.lines]?.length, `${h.id}.${k}`).toBeGreaterThan(0);
  });

  it('os novos não repetem o nome do herói em que se basearam', () => {
    for (const h of Object.values(GAME_DATA.heroes)) {
      if (['boladex', 'maguim', 'mano_cura', 'distanciado'].includes(h.id)) continue;
      const text = Object.values(h.lines).flat().join(' ');
      for (const other of ['Boladex', 'Maguim', 'Mano Cura', 'Distanciado']) expect(text, h.id).not.toContain(other);
    }
  });

  it('a marca antiga ("1") conta só os 4 primeiros: os novos ainda são criados para quem já jogava', () => {
    expect([...seededHeroes('1')].sort()).toEqual(['boladex', 'distanciado', 'maguim', 'mano_cura']);
    expect(seededHeroes(null).size).toBe(0);
    expect([...seededHeroes(JSON.stringify(['boladex', 'ferrolho']))]).toEqual(['boladex', 'ferrolho']);
  });
});
