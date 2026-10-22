import { describe, expect, it } from 'vitest';
import { blockChance, maxWeaponDamage, mitigate, rollWeaponDamage, spellRange } from '../../src/domain/rules/damage';
import { GLOBAL_SPELL, isReady, remaining, startCooldown, type Cooldowns } from '../../src/domain/rules/cooldowns';
import { castFailMessage, validateCast, type CastContext } from '../../src/domain/rules/spells';
import { fixedRng } from '../../src/domain/value-objects/rng';
import { SPELLS } from '../../src/data/spells';

describe('cálculo de dano', () => {
  const base = { level: 1, skill: 10, weaponAttack: 10, vocationModifier: 1 };
  it('dano máximo cresce com skill, ataque, nível e vocação', () => {
    const m = maxWeaponDamage(base);
    expect(maxWeaponDamage({ ...base, skill: 20 })).toBeGreaterThan(m);
    expect(maxWeaponDamage({ ...base, weaponAttack: 16 })).toBeGreaterThan(m);
    expect(maxWeaponDamage({ ...base, level: 10 })).toBeGreaterThan(m);
    expect(maxWeaponDamage({ ...base, vocationModifier: 0.6 })).toBeLessThan(m);
  });
  it('rolagem fica entre 35% e 100% do máximo', () => {
    const max = maxWeaponDamage(base);
    expect(rollWeaponDamage(base, fixedRng(0))).toBe(Math.round(max * 0.35));
    expect(rollWeaponDamage(base, fixedRng(0.999999))).toBe(Math.round(max));
  });
  it('armadura reduz apenas dano físico', () => {
    const rng = fixedRng(0.999999);
    expect(mitigate(20, 'physical', { armor: 6 }, rng).damage).toBe(14);
    expect(mitigate(20, 'fire', { armor: 6 }, rng).damage).toBe(20);
  });
  it('resistências e redução percentual são aplicadas', () => {
    const rng = fixedRng(0);
    expect(mitigate(20, 'earth', { armor: 0, resistances: { earth: 0.5 } }, rng).damage).toBe(10);
    expect(mitigate(20, 'fire', { armor: 0, resistances: { fire: 1.25 } }, rng).damage).toBe(25);
    expect(mitigate(20, 'fire', { armor: 0, damageReduction: 0.35 }, rng).damage).toBe(13);
  });
  it('dano absorvido por completo é sinalizado', () => {
    const r = mitigate(3, 'physical', { armor: 10 }, fixedRng(0.9));
    expect(r.damage).toBe(0);
    expect(r.absorbed).toBe(true);
  });
  it('fórmula de magia escala com nível e Magic Level', () => {
    const f = SPELLS['arcane_bolt']!.formula!;
    const [a1, b1] = spellRange(f, { level: 1, power: 0, weaponAttack: 0 }, 1);
    const [a2, b2] = spellRange(f, { level: 10, power: 5, weaponAttack: 0 }, 1);
    expect(a2).toBeGreaterThan(a1);
    expect(b2).toBeGreaterThan(b1);
    expect(b1).toBeGreaterThanOrEqual(a1);
  });
  it('bloqueio exige escudo e respeita o limite', () => {
    expect(blockChance(50, 0, 0.05, 0.008, 0.45)).toBe(0);
    expect(blockChance(200, 14, 0.05, 0.008, 0.45)).toBe(0.45);
    expect(blockChance(10, 8, 0.05, 0.008, 0.45)).toBeCloseTo(0.05 + 0.08 + 0.08);
  });
});

describe('cooldowns com tempo explícito', () => {
  it('controla disponibilidade e tempo restante', () => {
    const cd: Cooldowns = {};
    expect(isReady(cd, GLOBAL_SPELL, 0)).toBe(true);
    startCooldown(cd, GLOBAL_SPELL, 1000, 1500);
    expect(isReady(cd, GLOBAL_SPELL, 2000)).toBe(false);
    expect(remaining(cd, GLOBAL_SPELL, 2000)).toBe(500);
    expect(isReady(cd, GLOBAL_SPELL, 2500)).toBe(true);
  });
});

describe('validação de magias', () => {
  const ctx: CastContext = {
    vocation: 'sorcerer',
    level: 10,
    magicLevel: 5,
    mana: 500,
    dead: false,
    cooldownRemaining: 0,
    globalCooldownRemaining: 0,
    inProtectionZone: false,
    target: { exists: true, alive: true, hostile: true, distance: 3, lineOfSight: true },
    weaponKind: 'wand',
  };
  const bolt = SPELLS['arcane_bolt']!;
  it('aceita uma conjuração válida', () => expect(validateCast(bolt, ctx)).toEqual({ ok: true }));
  it.each([
    ['vocation', { vocation: 'knight' as const }],
    ['noMana', { mana: 5 }],
    ['cooldown', { cooldownRemaining: 200 }],
    ['cooldown', { globalCooldownRemaining: 200 }],
    ['noTarget', { target: null }],
    ['outOfRange', { target: { exists: true, alive: true, hostile: true, distance: 9, lineOfSight: true } }],
    ['noLineOfSight', { target: { exists: true, alive: true, hostile: true, distance: 3, lineOfSight: false } }],
    ['invalidTarget', { target: { exists: true, alive: false, hostile: true, distance: 3, lineOfSight: true } }],
    ['protectionZone', { inProtectionZone: true }],
    ['dead', { dead: true }],
  ] as const)('rejeita por %s', (reason, patch) => {
    const r = validateCast(bolt, { ...ctx, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(reason);
      expect(castFailMessage(r.reason, r.detail).length).toBeGreaterThan(3);
    }
  });
  it('exige nível e Magic Level mínimos', () => {
    const nova = SPELLS['fire_nova']!;
    expect(validateCast(nova, { ...ctx, level: 1 })).toMatchObject({ ok: false, reason: 'level' });
    expect(validateCast(nova, { ...ctx, magicLevel: 0 })).toMatchObject({ ok: false, reason: 'magicLevel' });
  });
  it('magias de cura funcionam em zona protegida e sem alvo', () => {
    const heal = SPELLS['light_heal']!;
    expect(validateCast(heal, { ...ctx, inProtectionZone: true, target: null })).toEqual({ ok: true });
  });
  it('chuva de flechas exige arma de distância', () => {
    const rain = SPELLS['arrow_rain']!;
    const pal = { ...ctx, vocation: 'paladin' as const, weaponKind: 'distance' as const };
    expect(validateCast(rain, { ...pal, weaponKind: 'melee' })).toMatchObject({ ok: false, reason: 'weapon' });
    expect(validateCast(rain, pal)).toEqual({ ok: true });
  });
});
