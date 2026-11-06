// Ferramenta: os quatro heróis no "jogo de verdade" (lifelike) por N minutos — sessões, pausas (sai e volta), AFK,
// quanto tempo levam para deslogar depois de se despedir, conversa e progresso.
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import type { HeroEntity } from '../../src/game/entities/types';
import { advance, makeSim } from '../helpers';

test('vida humana', { timeout: 900_000 }, () => {
  const minutes = Number(process.env.HERO_MINUTES ?? 180);
  const sim = makeSim('knight', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  w.lifelike = true;
  for (const id of ['boladex', 'maguim', 'mano_cura', 'distanciado']) {
    const hero = GAME_DATA.heroes[id]!;
    sim.addHero(hero, createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart }));
  }
  sim.teleportPlayer(20, 40);
  const log: string[] = [];
  const byeAt = new Map<string, number>();
  const leaveTook: number[] = [];
  const afkMs: Record<string, number> = {};
  const speech: Record<string, number> = {};
  const keys: Record<string, number> = {};
  sim.events.on('speech', (e) => {
    speech[e.name] = (speech[e.name] ?? 0) + 1;
    keys[e.key ?? 'npc'] = (keys[e.key ?? 'npc'] ?? 0) + 1;
  });
  sim.events.on('heroLoggedOut', (e) => {
    const t = byeAt.get(e.character.name);
    if (t !== undefined) leaveTook.push(w.now - t);
    log.push(`${Math.round(w.now / 60000)} min · ${e.character.name} saiu (nv ${e.character.level})`);
  });
  let online = 0;
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    online += w.heroes.size;
    for (const h of w.heroes.values() as IterableIterator<HeroEntity>) {
      if (h.brain.human.leaving && !byeAt.has(h.character.name)) byeAt.set(h.character.name, w.now);
      if (!h.brain.human.leaving) byeAt.delete(h.character.name);
      if (h.brain.human.afkUntil > w.now) afkMs[h.character.name] = (afkMs[h.character.name] ?? 0) + 1000;
    }
  }
  const levels = [...w.heroes.values()].map((h) => `${h.character.name} nv${h.character.level} m${h.character.stats.deaths}`).concat(sim.resting.map((r) => `${r.character.name} (pausa) nv${r.character.level}`));
  process.stderr.write(
    `${log.join('\n')}\n\nmédia online: ${(online / (minutes * 60)).toFixed(2)} de 4\n` +
      `despedida → deslogar: ${leaveTook.map((t) => `${Math.round(t / 1000)}s`).join(', ') || '—'}\n` +
      `AFK (min): ${Object.entries(afkMs).map(([n, ms]) => `${n} ${(ms / 60000).toFixed(1)}`).join(', ') || '—'}\n` +
      `falas: ${Object.entries(speech).map(([n, c]) => `${n} ${c}`).join(', ')}\n` +
      `por situação: ${Object.entries(keys).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join(', ')}\n${levels.join(' | ')}\n`,
  );
});
