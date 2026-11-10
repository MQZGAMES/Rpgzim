import { describe, expect, it } from 'vitest';
import { GAME_DATA as D } from '../../src/data';
import { spellDetails } from '../../src/domain/rules/spellDetails';
import { spellRange } from '../../src/domain/rules/damage';
import { spellTiers } from '../../src/domain/rules/spells';
import { castSpell, spellCooldownRemaining } from '../../src/game/abilities/spells';
import { makeSim } from '../helpers';
import { maxStackOf } from '../../src/domain/rules/inventory';

describe('complete spell progression', () => {
  it('a conjured batch does not partially fill inventory for free when space is insufficient', () => {
    const w = makeSim('sorcerer').world;
    const c = w.player.character;
    c.level = 100;
    w.player.stats.magicLevel = 100;
    c.mana = 10000;
    c.inventory = [{ itemId: 'potion_mana', count: maxStackOf(D, 'potion_mana') - 1 }];
    const before = structuredClone(c.inventory);
    expect(castSpell(w, 'conjure_mana_small_3')).toBe(false);
    expect(c.inventory).toEqual(before);
    expect(c.mana).toBe(10000);
    expect(spellCooldownRemaining(w, 'conjure_mana_small')).toBe(0);
  });
  it('every spell has three grades with increasing requirements and power', () => {
    for (const base of Object.values(D.spells).filter((s) => !s.baseId)) {
      const tiers = spellTiers(D.spells, base.id).map((id) => D.spells[id]!);
      expect(tiers).toHaveLength(3);
      expect(tiers.map((s) => s.tier)).toEqual([1, 2, 3]);
      for (const voc of base.vocations)
        for (const s of tiers) expect(D.vocations[voc].spells).toContain(s.id);
      expect(tiers[1]!.minLevel).toBeGreaterThan(base.minLevel);
      expect(tiers[2]!.minLevel).toBeGreaterThan(tiers[1]!.minLevel);
      if (base.formula) {
        const ranges = tiers.map(
          (s) => spellRange(s.formula!, { level: 100, power: 60, weaponAttack: 50 }, 1)[0],
        );
        expect(ranges[1]).toBeGreaterThan(ranges[0]!);
        expect(ranges[2]).toBeGreaterThan(ranges[1]!);
      }
    }
  });
  it('running and mana shield preserve cost, cooldown and potency', () => {
    for (const id of ['haste', 'mana_shield']) {
      const base = D.spells[id]!;
      for (const tid of spellTiers(D.spells, id)) {
        const s = D.spells[tid]!;
        expect(s.buff!.value).toBe(base.buff!.value);
        expect(s.buff!.durationMs).toBe(base.buff!.durationMs * s.tier!);
        expect(s.manaCost).toBe(base.manaCost);
        expect(s.cooldownMs).toBe(base.cooldownMs);
      }
    }
  });
  it('grades cannot bypass cooldowns after the support group recovers', () => {
    const w = makeSim('sorcerer').world;
    w.player.character.level = 100;
    w.player.stats.magicLevel = 100;
    w.player.character.mana = 10000;
    expect(castSpell(w, 'mana_shield_3')).toBe(true);
    w.now += 3000;
    expect(spellCooldownRemaining(w, 'mana_shield')).toBe(5000);
    expect(castSpell(w, 'mana_shield')).toBe(false);
    w.now += 5000;
    w.player.stats.magicLevel = 100;
    expect(castSpell(w, 'mana_shield')).toBe(true);
  });
  it('details show actual duration and formulas without encoding errors', () => {
    for (const s of Object.values(D.spells)) {
      const details = spellDetails(s).join(' ');
      expect(details).not.toContain('?');
      if (s.buff) expect(details).toContain(`${s.buff.durationMs / 1000}s`);
      if (s.formula) expect(details).toContain('Resultado arredondado');
    }
  });
});
