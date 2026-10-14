// Cooldowns com tempo explícito: guardam o instante (ms de simulação) em que cada ação volta a ficar livre.
export type Cooldowns = Record<string, number>;

export const GLOBAL_SPELL = 'gcd:spell';
export const POTION = 'gcd:potion';

export function remaining(cd: Cooldowns, key: string, now: number): number {
  return Math.max(0, (cd[key] ?? 0) - now);
}

export function isReady(cd: Cooldowns, key: string, now: number): boolean {
  return remaining(cd, key, now) === 0;
}

export function startCooldown(cd: Cooldowns, key: string, now: number, durationMs: number): void {
  cd[key] = now + Math.max(0, durationMs);
}
