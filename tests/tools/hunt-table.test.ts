// Ferramenta: para cada vocação num nível (HERO_LEVEL), a régua de cada criatura: margem contra 3, XP/min e a escolha.
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { fightMargin, xpPerMinute } from '../../src/game/ai/heroThreat';
import { huntChoiceDebug } from '../../src/game/ai/heroBrain';
import { makeSim } from '../helpers';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';

test('tabela de caça', { timeout: 600_000 }, () => {
  if (!process.env.RPGZIM_TOOLS) return;
  const level = Number(process.env.HERO_LEVEL ?? 30);
  const sim = makeSim('druid', { seed: 3 });
  const w = sim.world;
  const out: string[] = [];
  for (const def of Object.values(GAME_DATA.heroes)) {
    const c = createCharacter(GAME_DATA, {
      id: def.slotId,
      name: def.name,
      vocation: def.vocation,
      now: 0,
      position: w.map.playerStart,
    });
    c.level = level;
    for (const k of ['sword', 'club', 'axe', 'distance', 'shielding'] as const)
      if (c.skills[k]) c.skills[k].level = Math.round(10 + level * 1.1);
    c.skills.magic.level =
      def.vocation === 'sorcerer' || def.vocation === 'druid' ? Math.round(level * 1.1) : Math.round(level / 4);
    c.inventory[0] = { itemId: 'potion_health_great', count: 40 };
    c.inventory[1] = { itemId: 'potion_mana_great', count: 40 };
    const h = sim.addHero(def, c) as HeroEntity;
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    out.push(`\n== ${def.name} (${def.vocation} ${level}) hp ${h.stats.maxHealth} arma ${h.stats.weapon.attack}`);
    const rows = Object.values(w.data.monsters)
      .filter((m) => w.map.spawns.some((s) => s.monsterId === m.id))
      .sort((a, b) => a.level - b.level)
      .map((m) => {
        const proto = Array.from({ length: 3 }, () => ({ def: m, hp: m.health }) as unknown as MonsterEntity);
        return `${m.id.padEnd(16)} n${String(m.level).padStart(3)} margem3 ${fightMargin(w, h, proto).toFixed(2).padStart(6)} xp/min ${xpPerMinute(w, h, m.id).toFixed(0).padStart(6)}`;
      });
    out.push(...rows);
    out.push('escolhas: ' + asActor(w, h, () => huntChoiceDebug(w, h)));
    w.heroes.delete(h.id);
  }
  process.stderr.write(out.join('\n') + '\n');
});
