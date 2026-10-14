// Aplica as regras de progressão ao personagem e publica os eventos correspondentes.
import type { SkillId } from '../../domain/entities/definitions';
import { applyXp } from '../../domain/rules/experience';
import { trainSkill } from '../../domain/rules/skills';
import { computeStats } from '../../domain/rules/stats';
import { SKILL_LABEL } from '../../domain/entities/definitions';
import type { World } from '../simulation/World';
import { message } from '../simulation/World';

/** Recalcula atributos derivados e ajusta vida/mana ao novo máximo. */
export function refreshStats(w: World): void {
  const p = w.player;
  p.stats = computeStats(w.data, p.character, p.buffs.filter((b) => b.expiresAt > w.now));
  p.character.health = Math.min(p.character.health, p.stats.maxHealth);
  p.character.mana = Math.min(p.character.mana, p.stats.maxMana);
}

export function gainExperience(w: World, amount: number): void {
  const c = w.player.character;
  const res = applyXp(c.level, c.experience, amount, w.data.balance.experience);
  c.experience = res.experience;
  w.events.emit('xpGained', { amount, position: { x: w.player.x, y: w.player.y } });
  if (res.levelsGained > 0) {
    c.level = res.level;
    refreshStats(w);
    // ao subir de nível o personagem recupera vida e mana (decisão de design do MVP)
    c.health = w.player.stats.maxHealth;
    c.mana = w.player.stats.maxMana;
    w.events.emit('levelUp', { level: c.level });
    message(w, `Você avançou para o nível ${c.level}!`, 'levelup');
    const newSpells = w.data.vocations[c.vocation].spells.map((id) => w.data.spells[id]!).filter((s) => s.minLevel > c.level - res.levelsGained && s.minLevel <= c.level);
    for (const s of newSpells) message(w, `Nova magia disponível: ${s.name}.`, 'levelup');
    w.events.emit('saveRequested', { reason: 'levelUp' });
  }
}

export function trainPlayerSkill(w: World, skill: SkillId, amount: number): void {
  if (amount <= 0) return;
  const c = w.player.character;
  const mult = w.data.vocations[c.vocation].skillMultipliers[skill];
  const res = trainSkill(skill, c.skills[skill], amount, mult, w.data.balance);
  c.skills[skill] = res.state;
  if (res.levelsGained > 0) {
    refreshStats(w);
    w.events.emit('skillUp', { skill, level: res.state.level });
    message(w, `${SKILL_LABEL[skill]} subiu para ${res.state.level}.`, 'levelup');
    w.events.emit('saveRequested', { reason: 'skillUp' });
  }
}
