import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { applyDeathPenalty, applyXp, levelForXp, levelProgress, totalXpForLevel } from '../../src/domain/rules/experience';
import { applySkillDeathLoss, skillProgress, trainSkill, triesForNextLevel } from '../../src/domain/rules/skills';

const xp = BALANCE.experience;

describe('experiência e nível', () => {
  it('nível 1 começa com 0 XP e a curva é crescente', () => {
    expect(totalXpForLevel(1, xp)).toBe(0);
    let prevStep = 0;
    for (let l = 2; l < 40; l++) {
      const step = totalXpForLevel(l + 1, xp) - totalXpForLevel(l, xp);
      expect(step).toBeGreaterThan(prevStep);
      prevStep = step;
    }
  });

  it('calcula o nível a partir do XP nas fronteiras', () => {
    const l5 = totalXpForLevel(5, xp);
    expect(levelForXp(l5 - 1, xp)).toBe(4);
    expect(levelForXp(l5, xp)).toBe(5);
  });

  it('aplica ganho de XP com múltiplos níveis de uma vez', () => {
    const res = applyXp(1, 0, totalXpForLevel(4, xp) + 3, xp);
    expect(res.level).toBe(4);
    expect(res.levelsGained).toBe(3);
  });

  it('progresso para o próximo nível fica entre 0 e 1', () => {
    const cur = totalXpForLevel(3, xp);
    const next = totalXpForLevel(4, xp);
    expect(levelProgress(3, cur, xp)).toBe(0);
    expect(levelProgress(3, (cur + next) / 2, xp)).toBeCloseTo(0.5, 1);
  });

  it('a penalidade de morte tira metade da faixa do nível e não rebaixa se o XP do nível cobre', () => {
    const floor = totalXpForLevel(6, xp);
    const span = totalXpForLevel(7, xp) - floor;
    const high = floor + Math.floor(span * 0.8);
    const res = applyDeathPenalty(6, high, 0.5, xp);
    expect(res.level).toBe(6);
    expect(res.levelsLost).toBe(0);
    expect(Math.abs(res.experience - (high - span * 0.5))).toBeLessThanOrEqual(1);
  });

  it('a penalidade de morte desce de nível, levando o resto do nível anterior (10% -> 60% do anterior)', () => {
    const floor = totalXpForLevel(6, xp);
    const span = totalXpForLevel(7, xp) - floor;
    const res = applyDeathPenalty(6, floor + Math.floor(span * 0.1), 0.5, xp);
    expect(res.level).toBe(5);
    expect(res.levelsLost).toBe(1);
    const prevFloor = totalXpForLevel(5, xp);
    const prevSpan = floor - prevFloor;
    const progress = (res.experience - prevFloor) / prevSpan;
    expect(progress).toBeGreaterThan(0.55);
    expect(progress).toBeLessThan(0.65);
  });

  it('a penalidade de morte nunca passa do nível 1 nem do XP zero', () => {
    const res = applyDeathPenalty(1, 5, 0.5, xp);
    expect(res.level).toBe(1);
    expect(res.experience).toBeGreaterThanOrEqual(0);
    expect(res.levelsLost).toBe(0);
  });
});

describe('skills evoluem pelo uso (não linear)', () => {
  it('cada nível exige mais tentativas que o anterior', () => {
    const a = triesForNextLevel('sword', 10, 1, BALANCE);
    const b = triesForNextLevel('sword', 11, 1, BALANCE);
    const c = triesForNextLevel('sword', 20, 1, BALANCE);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b * 2);
  });

  it('acumula treino e sobe somente ao atingir o limiar', () => {
    const need = triesForNextLevel('axe', 10, 1, BALANCE);
    let st = { level: 10, tries: 0 };
    for (let i = 0; i < need - 1; i++) st = trainSkill('axe', st, 1, 1, BALANCE).state;
    expect(st.level).toBe(10);
    const res = trainSkill('axe', st, 1, 1, BALANCE);
    expect(res.state.level).toBe(11);
    expect(res.levelsGained).toBe(1);
    expect(res.state.tries).toBe(0);
  });

  it('multiplicador de vocação torna o treino mais lento', () => {
    expect(triesForNextLevel('sword', 10, 2, BALANCE)).toBe(triesForNextLevel('sword', 10, 1, BALANCE) * 2);
  });

  it('Magic Level usa mana gasta com crescimento exponencial', () => {
    const ml0 = triesForNextLevel('magic', 0, 1, BALANCE);
    const ml1 = triesForNextLevel('magic', 1, 1, BALANCE);
    expect(ml0).toBe(BALANCE.magic.baseMana);
    expect(ml1).toBeGreaterThan(ml0);
    const res = trainSkill('magic', { level: 0, tries: 0 }, ml0 + ml1 + 5, 1, BALANCE);
    expect(res.state.level).toBe(2);
    expect(res.state.tries).toBe(5);
    expect(skillProgress('magic', res.state, 1, BALANCE)).toBeGreaterThan(0);
  });
});

describe('perda de skills na morte', () => {
  it('perde treino e pode descer de nível, mas nunca abaixo de 10', () => {
    const need = triesForNextLevel('sword', 14, 1, BALANCE);
    const a = applySkillDeathLoss('sword', { level: 14, tries: need * 0.8 }, 0.5, 1, BALANCE);
    expect(a.level).toBe(14);
    expect(a.tries).toBeLessThan(need * 0.8);
    const b = applySkillDeathLoss('sword', { level: 14, tries: 0 }, 0.5, 1, BALANCE);
    expect(b.level).toBe(13);
    expect(b.tries).toBeLessThan(triesForNextLevel('sword', 13, 1, BALANCE));
    let s = { level: 11, tries: 0 };
    for (let i = 0; i < 20; i++) s = applySkillDeathLoss('club', s, 0.5, 1, BALANCE);
    expect(s).toEqual({ level: 10, tries: 0 });
    expect(applySkillDeathLoss('shielding', { level: 10, tries: 3 }, 0.5, 1, BALANCE).level).toBe(10);
    expect(applySkillDeathLoss('magic', { level: 0, tries: 5 }, 0.5, 1, BALANCE)).toEqual({ level: 0, tries: 0 });
  });
});
