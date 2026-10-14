// Evolução de skills pelo uso. Cada nível exige mais treino (crescimento exponencial) e cada vocação
// tem um multiplicador de dificuldade por skill. O Magic Level usa mana gasta como "tentativas".
import type { BalanceConfig, SkillId } from '../entities/definitions';
import type { SkillState } from '../entities/character';

export const MAX_SKILL = 150;

/** Tentativas necessárias para avançar do nível `level` para `level + 1`. */
export function triesForNextLevel(skill: SkillId, level: number, vocationMultiplier: number, balance: BalanceConfig): number {
  if (skill === 'magic') {
    return Math.round(balance.magic.baseMana * Math.pow(balance.magic.growth, level) * vocationMultiplier);
  }
  const steps = Math.max(0, level - balance.skills.startLevel);
  return Math.round(balance.skills.baseTries * Math.pow(balance.skills.growth, steps) * vocationMultiplier);
}

export interface SkillTrainResult {
  state: SkillState;
  levelsGained: number;
}

/** Acumula treino; pode subir vários níveis se o ganho for grande, sempre respeitando os limiares. */
export function trainSkill(
  skill: SkillId,
  current: SkillState,
  amount: number,
  vocationMultiplier: number,
  balance: BalanceConfig,
): SkillTrainResult {
  let { level, tries } = current;
  tries += Math.max(0, amount);
  let levelsGained = 0;
  while (level < MAX_SKILL) {
    const need = triesForNextLevel(skill, level, vocationMultiplier, balance);
    if (tries < need) break;
    tries -= need;
    level++;
    levelsGained++;
  }
  return { state: { level, tries }, levelsGained };
}

export function skillProgress(skill: SkillId, state: SkillState, vocationMultiplier: number, balance: BalanceConfig): number {
  const need = triesForNextLevel(skill, state.level, vocationMultiplier, balance);
  return need <= 0 ? 1 : Math.min(1, state.tries / need);
}
