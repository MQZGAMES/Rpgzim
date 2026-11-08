// Cooldowns com tempo explícito: guardam o instante (ms de simulação) em que cada ação volta a ficar livre.
export type Cooldowns = Record<string, number>;

export const GLOBAL_SPELL = 'gcd:spell';
export const POTION = 'gcd:potion';

/**
 * Exaustão por grupo (como no Tibia): atacar não impede curar nem beber poção, e vice-versa — cada grupo tem a sua.
 * - ataque: 2 s entre duas magias de ataque quaisquer;
 * - cura: 2 s entre duas magias de cura;
 * - suporte (Corrida, escudos, criação de poção...): a exaustão curta de antes, só entre elas;
 * - poções: 2 s (chave POTION, no uso do item).
 */
export type SpellGroup = 'attack' | 'heal' | 'support';
export const SPELL_GROUP_KEY: Record<SpellGroup, string> = { attack: 'gcd:attack', heal: 'gcd:heal', support: GLOBAL_SPELL };
export function spellGroup(spell: { effect: string }): SpellGroup {
  return spell.effect === 'damage' ? 'attack' : spell.effect === 'heal' ? 'heal' : 'support';
}

export function remaining(cd: Cooldowns, key: string, now: number): number {
  return Math.max(0, (cd[key] ?? 0) - now);
}

export function isReady(cd: Cooldowns, key: string, now: number): boolean {
  return remaining(cd, key, now) === 0;
}

export function startCooldown(cd: Cooldowns, key: string, now: number, durationMs: number): void {
  cd[key] = now + Math.max(0, durationMs);
}
