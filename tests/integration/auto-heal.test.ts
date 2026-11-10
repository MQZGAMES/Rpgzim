import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO, updateAutoPlay, choosePotion } from '../../src/game/ai/autoPlay';
import { POTION } from '../../src/domain/rules/cooldowns';
import { makeSim } from '../helpers';

function setup() {
  const w = makeSim().world;
  w.auto = { ...DEFAULT_AUTO, autoHeal: true, spellHeal: true };
  w.player.character.inventory.fill(null);
  w.player.character.health = 1;
  w.player.character.mana = 0;
  return w;
}

describe('automatic healing fallbacks', () => {
  it('uses mana potion with low HP when health potions are absent', () => {
    const w = setup();
    w.player.character.inventory[0] = { itemId: 'potion_mana', count: 2 };
    updateAutoPlay(w);
    expect(w.player.character.mana).toBeGreaterThan(0);
    expect(w.player.character.inventory[0]?.count).toBe(1);
  });
  it('ignores health potions above the player level and still restores mana', () => {
    const w = setup();
    w.player.character.inventory[0] = { itemId: 'potion_health_supreme', count: 1 };
    w.player.character.inventory[1] = { itemId: 'potion_mana', count: 1 };
    updateAutoPlay(w);
    expect(w.player.character.mana).toBeGreaterThan(0);
    expect(w.player.character.inventory[0]?.count).toBe(1);
  });
  it('does not share the polling timer between worlds', () => {
    const old = setup();
    old.now = 100000;
    updateAutoPlay(old);
    const w = setup();
    w.player.character.inventory[0] = { itemId: 'potion_health', count: 1 };
    updateAutoPlay(w);
    expect(w.player.character.health).toBeGreaterThan(1);
  });
  it('can replenish mana on the same step as a healing spell', () => {
    const w = setup();
    w.player.stats.maxMana = 1000;
    w.player.character.mana = 100;
    w.player.character.health = Math.floor(w.player.stats.maxHealth * 0.5);
    w.player.character.inventory[0] = { itemId: 'potion_mana', count: 1 };
    updateAutoPlay(w);
    expect(w.player.cooldowns['spell:light_heal']).toBeGreaterThan(0);
    expect(w.player.character.inventory[0]).toBeNull();
  });
  it('prioritizes health over mana and respects potion cooldown', () => {
    const w = setup();
    w.player.character.inventory[0] = { itemId: 'potion_health', count: 2 };
    w.player.character.inventory[1] = { itemId: 'potion_mana', count: 2 };
    updateAutoPlay(w);
    expect(w.player.character.inventory[0]?.count).toBe(1);
    expect(w.player.character.mana).toBe(0);
    w.now += 400;
    updateAutoPlay(w);
    expect(w.player.character.inventory[1]?.count).toBe(2);
    w.now = w.player.cooldowns[POTION]!;
    w.player.character.health = w.player.stats.maxHealth;
    updateAutoPlay(w);
    expect(w.player.character.mana).toBeGreaterThan(0);
  });
  it('honors disabled automation and potion preferences', () => {
    const w = setup();
    w.player.character.inventory[0] = { itemId: 'potion_health', count: 1 };
    w.auto.autoHeal = false;
    updateAutoPlay(w);
    expect(w.player.character.health).toBe(1);
    w.auto.autoHeal = true;
    w.auto.potionHp = false;
    w.auto.potionMana = false;
    w.now += 400;
    updateAutoPlay(w);
    expect(w.player.character.inventory[0]?.count).toBe(1);
    expect(choosePotion(w, 'heal', 100, 'small')).toBe(0);
    expect(choosePotion(w, 'mana', 100, 'large')).toBe(-1);
  });
  it('resumes spell healing after a mana potion on the next poll', () => {
    const w = setup();
    w.player.character.inventory[0] = { itemId: 'potion_mana', count: 2 };
    updateAutoPlay(w);
    expect(w.player.character.mana).toBeGreaterThan(0);
    w.now += 400;
    updateAutoPlay(w);
    expect(w.player.character.health).toBeGreaterThan(1);
    expect(w.player.cooldowns['spell:light_heal']).toBeGreaterThan(0);
    expect(w.player.character.inventory[0]?.count).toBe(1);
  });
  it('uses a health potion when healing spells are on cooldown', () => {
    const w = setup();
    w.player.character.mana = w.player.stats.maxMana;
    w.player.cooldowns['gcd:heal'] = w.now + 2000;
    w.player.character.inventory[0] = { itemId: 'potion_health', count: 1 };
    updateAutoPlay(w);
    expect(w.player.character.health).toBeGreaterThan(1);
    expect(w.player.character.inventory[0]).toBeNull();
  });
  it('does not consume potions at full resources or while dead', () => {
    const w = setup();
    w.player.character.inventory[0] = { itemId: 'potion_health', count: 2 };
    w.player.character.inventory[1] = { itemId: 'potion_mana', count: 2 };
    w.player.character.health = w.player.stats.maxHealth;
    w.player.character.mana = w.player.stats.maxMana;
    updateAutoPlay(w);
    w.now += 400;
    w.player.dead = true;
    w.player.character.health = 0;
    w.player.character.mana = 0;
    updateAutoPlay(w);
    expect(w.player.character.inventory[0]?.count).toBe(2);
    expect(w.player.character.inventory[1]?.count).toBe(2);
  });
  it('selects small, large and fitting usable potions', () => {
    const w = setup();
    w.player.character.level = 28;
    w.player.character.inventory[0] = { itemId: 'potion_health', count: 1 };
    w.player.character.inventory[1] = { itemId: 'potion_health_great', count: 1 };
    w.player.character.inventory[2] = { itemId: 'potion_health_supreme', count: 1 };
    expect(choosePotion(w, 'heal', 200, 'small')).toBe(0);
    expect(choosePotion(w, 'heal', 200, 'large')).toBe(2);
    expect(choosePotion(w, 'heal', 200, 'fit')).toBe(1);
    w.player.character.level = 1;
    expect(choosePotion(w, 'heal', 200, 'large')).toBe(0);
  });
});
