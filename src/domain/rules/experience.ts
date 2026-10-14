// Curva de experiência configurável: XP total para alcançar o nível L = base * (L - 1)^expoente.
import type { BalanceConfig } from '../entities/definitions';

export const MAX_LEVEL = 200;

export function totalXpForLevel(level: number, cfg: BalanceConfig['experience']): number {
  if (level <= 1) return 0;
  return Math.round(cfg.base * Math.pow(level - 1, cfg.exponent));
}

export function levelForXp(xp: number, cfg: BalanceConfig['experience']): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1, cfg)) level++;
  return level;
}

/** Progresso (0..1) entre o nível atual e o próximo. */
export function levelProgress(level: number, xp: number, cfg: BalanceConfig['experience']): number {
  const cur = totalXpForLevel(level, cfg);
  const next = totalXpForLevel(level + 1, cfg);
  if (next <= cur) return 1;
  return Math.max(0, Math.min(1, (xp - cur) / (next - cur)));
}

export interface XpGainResult {
  experience: number;
  level: number;
  levelsGained: number;
}

export function applyXp(level: number, xp: number, gain: number, cfg: BalanceConfig['experience']): XpGainResult {
  const experience = Math.max(0, xp + Math.max(0, Math.floor(gain)));
  const newLevel = Math.max(level, levelForXp(experience, cfg));
  return { experience, level: newLevel, levelsGained: newLevel - level };
}

/** Penalidade de morte: perde uma fração do XP necessário ao nível atual, sem perder o nível. */
export function applyDeathPenalty(level: number, xp: number, fraction: number, cfg: BalanceConfig['experience']): number {
  const floor = totalXpForLevel(level, cfg);
  const span = totalXpForLevel(level + 1, cfg) - floor;
  return Math.max(floor, Math.floor(xp - span * fraction));
}
