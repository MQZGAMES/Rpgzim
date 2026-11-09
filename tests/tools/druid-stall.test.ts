// Ferramenta (RPGZIM_TOOLS=1): detector de "impasse" — herói parado no mesmo lugar, com criaturas em cima, sem matar
// nem morrer. Roda os 8 heróis por STALL_MIN minutos (STALL_MODE=off|ffa|guilds, STALL_SEED) e mostra, por herói, o
// maior trecho assim. Nasceu do druida desarmado preso entre aranhas (curava para sempre sem conseguir matar).
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { customHeroDef } from '../../src/data/heroes';
import { createCharacter } from '../../src/domain/rules/character';
import { refreshStats } from '../../src/game/progression/progression';
import type { WarMode } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('impasses', { timeout: 1_800_000 }, () => {
  const minutes = Number(process.env.STALL_MIN ?? 20);
  const sim = makeSim('knight', { seed: Number(process.env.STALL_SEED ?? 7) });
  const w = sim.world;
  const vocs = ['knight', 'sorcerer', 'druid', 'paladin'] as const;
  const defs = [
    ...Object.values(GAME_DATA.heroes),
    ...Array.from({ length: 4 }, (_, i) =>
      customHeroDef({ id: `extra_${i}`, name: `Extra${i}`, vocation: vocs[i % 4]! }),
    ),
  ];
  const heroes = defs.map((def, i) => {
    const c = createCharacter(GAME_DATA, {
      id: def.slotId,
      name: def.name,
      vocation: def.vocation,
      now: 0,
      position: w.map.playerStart,
    });
    c.level = 20 + ((i * 7) % 11) - 5;
    c.gold = 2000;
    const h = sim.addHero(def, c) as HeroEntity;
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    h.character.mana = h.stats.maxMana;
    return h;
  });
  sim.setWar((process.env.STALL_MODE ?? 'ffa') as WarMode);
  const since: Record<string, { x: number; y: number; at: number; deaths: number; xp: number }> = {};
  const worst: Record<string, { s: number; at: number; where: string; mode: string; weapon: string }> = {};
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    const who = heroes.find((h) => h.character.name === process.env.STALL_WHO);
    if (who && s >= Number(process.env.STALL_FROM ?? 0) && s < Number(process.env.STALL_TO ?? 0)) {
      const mobs = [...w.monsters.values()].filter((m) => m.alive && Math.max(Math.abs(m.x - who.x), Math.abs(m.y - who.y)) <= 2).map((m) => `${m.def.id}:${m.hp}/${m.def.health}@${Math.max(Math.abs(m.x - who.x), Math.abs(m.y - who.y))}${m.targetId === who.id ? '*' : ''}`).join(' ');
      process.stderr.write(`${s}s ${who.brain.mode} hp=${who.character.health}/${who.stats.maxHealth} mana=${who.character.mana}/${who.stats.maxMana} tgt=${who.targetId} lastAtk=${Math.round((w.now - who.lastAttackAt) / 1000)}s why=${who.brain.retreatWhy} route=${Math.round((w.now - (who.brain.routeFailedAt ?? -1e9)) / 1000)} fb=${Math.round((who.brain.fightBackUntil - w.now) / 1000)} path=${who.path?.length ?? 0} pz=${w.social.pzLocks.has(who.id)} | ${mobs}
`);
    }
    for (const h of heroes) {
      const n = h.character.name;
      const hit = [...w.monsters.values()].some((m) => m.alive && m.targetId === h.id && Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y)) <= 1);
      const cur = since[n];
      const still = cur && cur.x === h.x && cur.y === h.y && cur.deaths === h.character.stats.deaths && cur.xp === h.character.experience && hit && !h.dead;
      if (!still) since[n] = { x: h.x, y: h.y, at: s, deaths: h.character.stats.deaths, xp: h.character.experience };
      else {
        const len = s - cur.at;
        if (!worst[n] || len > worst[n].s)
          worst[n] = { s: len, at: cur.at, where: `${h.x},${h.y}`, mode: h.brain.mode, weapon: h.character.equipment.mainHand?.itemId ?? 'SEM ARMA' };
      }
    }
  }
  process.stderr.write(
    `\n=== impasses (${process.env.STALL_MODE ?? 'ffa'}, ${minutes} min) ===\n` +
      heroes
        .map((h) => {
          const x = worst[h.character.name];
          return `${h.character.name.padEnd(12)} maior trecho parado apanhando sem ganhar XP: ${x ? `${x.s}s (desde ${x.at}s em ${x.where}, ${x.mode}, ${x.weapon})` : '0s'}`;
        })
        .join('\n') +
      '\n',
  );
});
