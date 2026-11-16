import { describe, expect, it } from 'vitest';
import { GAME_DATA as D } from '../../src/data';
import { spellDetails } from '../../src/domain/rules/spellDetails';
import { spellRange } from '../../src/domain/rules/damage';
import { castSpell, spellCooldownRemaining } from '../../src/game/abilities/spells';
import { makeSim } from '../helpers';
import { maxStackOf } from '../../src/domain/rules/inventory';

describe('complete spell progression', () => {
  it('conjuring with a full inventory costs no mana and starts no cooldown', () => {
    const w = makeSim('sorcerer').world;
    const c = w.player.character;
    c.level = 100;
    w.player.stats.magicLevel = 100;
    c.mana = 10000;
    c.inventory = Array.from({ length: c.inventory.length }, () => ({ itemId: 'potion_mana', count: maxStackOf(D, 'potion_mana') }));
    const before = structuredClone(c.inventory);
    expect(castSpell(w, 'conjure_mana_small')).toBe(false);
    expect(c.inventory).toEqual(before);
    expect(c.mana).toBe(10000);
    expect(spellCooldownRemaining(w, 'conjure_mana_small')).toBe(0);
  });
  it('spells have no grades: one id per spell, damage grows with level and magic level', () => {
    for (const s of Object.values(D.spells)) expect(s.id).not.toMatch(/_[23]$/);
    for (const s of Object.values(D.spells).filter((x) => x.formula)) {
      const lo = spellRange(s.formula!, { level: 20, power: 15, weaponAttack: 20 }, 1)[0];
      const hi = spellRange(s.formula!, { level: 100, power: 60, weaponAttack: 50 }, 1)[0];
      expect(hi, s.id).toBeGreaterThan(lo);
    }
  });
  it('mana shield keeps its own cooldown', () => {
    const w = makeSim('sorcerer').world;
    w.player.character.level = 100;
    w.player.stats.magicLevel = 100;
    w.player.character.mana = 10000;
    expect(castSpell(w, 'mana_shield')).toBe(true);
    w.now += 3000;
    expect(spellCooldownRemaining(w, 'mana_shield')).toBeGreaterThan(0);
    expect(castSpell(w, 'mana_shield')).toBe(false);
  });
  it('details show actual duration and formulas without encoding errors', () => {
    for (const s of Object.values(D.spells)) {
      const details = spellDetails(s).join(' ');
      expect(details).not.toContain('?');
      if (s.buff) expect(details).toContain(`${s.buff.durationMs / 1000}s`);
      if (s.formula) expect(details).toContain('Resultado arredondado');
      // os graus foram removidos: o texto não pode mais citá-los; "ML" só aparece em fórmula que usa Magic Level
      expect(details).not.toMatch(/Graus? I/);
      if (s.formula?.kind !== 'magic') expect(details).not.toContain('ML = Magic Level');
      expect(details).not.toMatch(/\b1 casas\b/);
    }
  });
});
