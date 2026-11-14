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

export interface DeathXpResult {
  experience: number;
  level: number;
  levelsLost: number;
}

/**
 * Penalidade de morte: perde uma fração do tamanho de um nível (em progresso, 0..1). Se o progresso do nível atual
 * não cobre a perda, o resto é tirado do nível anterior e o personagem desce de nível.
 * Ex.: com 10% no nível N e fração 0,5, perde os 10% e mais 40% do nível N-1, ficando em 60% do N-1.
 */
export function applyDeathPenalty(level: number, xp: number, fraction: number, cfg: BalanceConfig['experience']): DeathXpResult {
  let lv = level;
  let progress = levelProgress(lv, xp, cfg);
  let remaining = Math.max(0, fraction);
  while (remaining > 0 && lv > 1) {
    if (progress >= remaining) {
      progress -= remaining;
      remaining = 0;
    } else {
      remaining -= progress;
      lv -= 1;
      progress = 1;
    }
  }
  if (lv === 1) progress = Math.max(0, progress - remaining);
  const floor = totalXpForLevel(lv, cfg);
  const span = totalXpForLevel(lv + 1, cfg) - floor;
  const experience = Math.min(Math.floor(xp), Math.max(floor, floor + Math.floor(span * progress)));
  return { experience, level: lv, levelsLost: level - lv };
}
