// Ferramenta: os quatro heróis soltos no mundo por N minutos; mostra como se agrupam (RPGZIM_TOOLS=1).
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { allParties, actorName } from '../../src/game/social/social';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('grupos entre heróis', { timeout: 600_000 }, () => {
  const minutes = Number(process.env.HERO_MINUTES ?? 60);
  const sim = makeSim('druid', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  const heroes = Object.values(GAME_DATA.heroes).filter((d) => !process.env.HERO_ONLY || process.env.HERO_ONLY.split(',').includes(d.id)).map((def) => sim.addHero(def, createCharacter(GAME_DATA, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart })) as HeroEntity);
  let last = '';
  const lines: string[] = [];
  let partyMin = 0;
  const modes: Record<string, Record<string, number>> = {};
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    for (const h of heroes) { const m = (modes[h.character.name] ??= {}); m[h.brain.mode] = (m[h.brain.mode] ?? 0) + 1; }
    const desc = allParties(w).map((p) => `[${p.members.map((m) => actorName(w, m)).join('+')}]`).join(' ');
    if (allParties(w).length) partyMin++;
    if (desc !== last) {
      last = desc;
      lines.push(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} ${desc || '(sem grupos)'}`);
    }
  }
  process.stderr.write(lines.join('\n') + `\n\nTempo com algum grupo: ${Math.round((partyMin / (minutes * 60)) * 100)}%\n` + heroes.map((h) => `${h.character.name}: ${Object.entries(modes[h.character.name]!).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round((v / (minutes * 60)) * 100) + '%').join(' ')} nível ${h.character.level} mortes ${h.character.stats.deaths}`).join(' | ') + '\n');
});
