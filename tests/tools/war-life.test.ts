// Ferramenta: modo guerra por N minutos com os heróis soltos no mundo (RPGZIM_TOOLS=1).
// Mostra, por herói, o tempo em cada modo, mortes (por gente e por criatura), abates, poções e grupos.
// WAR_MODE=ffa|guilds  WAR_MINUTES=30  WAR_LEVEL=20  WAR_SEED=7  WAR_EXTRA=4 (personagens a mais)
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { customHeroDef } from '../../src/data/heroes';
import { createCharacter } from '../../src/domain/rules/character';
import { usablePotionCount } from '../../src/domain/rules/potions';
import { refreshStats } from '../../src/game/progression/progression';
import { allParties, actorName, guildOf, GUILD_NAMES, type WarMode } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { isPz } from '../../src/game/world/GameMap';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('vida na guerra', { timeout: 1_800_000 }, () => {
  const minutes = Number(process.env.WAR_MINUTES ?? 30);
  const mode = (process.env.WAR_MODE ?? 'ffa') as WarMode;
  const level = Number(process.env.WAR_LEVEL ?? 20);
  const extra = Number(process.env.WAR_EXTRA ?? 4);
  const sim = makeSim('knight', { seed: Number(process.env.WAR_SEED ?? 7) });
  const w = sim.world;
  const vocs = ['knight', 'sorcerer', 'druid', 'paladin'] as const;
  const defs = [
    ...Object.values(GAME_DATA.heroes),
    ...Array.from({ length: extra }, (_, i) =>
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
    c.level = level + ((i * 7) % 11) - 5; // níveis variados (há fortes e fracos)
    c.gold = 2000;
    const h = sim.addHero(def, c) as HeroEntity;
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    h.character.mana = h.stats.maxMana;
    return h;
  });
  sim.setWar(mode);
  const pvpDeaths: Record<string, number> = {};
  const mobDeaths: Record<string, number> = {};
  const kills: Record<string, number> = {};
  for (const h of heroes)
    h.scope.events.on('playerDied', (e) => {
      const n = h.character.name;
      if (e.byPlayer) {
        pvpDeaths[n] = (pvpDeaths[n] ?? 0) + 1;
        const k = e.killerId ? actorName(w, e.killerId) : (e.killerName ?? 'Desconhecido');
        kills[k] = (kills[k] ?? 0) + 1;
      } else mobDeaths[n] = (mobDeaths[n] ?? 0) + 1;
    });
  const modes: Record<string, Record<string, number>> = {};
  let betrayals = 0;
  w.events.on('speech', (e) => void (e.key === 'warBetray' && betrayals++));
  let partySec = 0;
  let maxParty = 0;
  const t0 = Date.now();
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    for (const h of heroes) {
      const m = (modes[h.character.name] ??= {});
      const k = h.dead ? 'dead' : h.brain.mode;
      m[k] = (m[k] ?? 0) + 1;
    }
    if (process.env.WAR_TRACE && s % 15 === 0)
      for (const h of heroes)
        if (h.brain.mode === 'retreat' && !h.dead)
          process.stderr
            .write(`${s}s RET ${h.character.name} why=${h.brain.retreatWhy} pz=${Math.round(((w.social.pzLocks.get(h.id) ?? 0) - w.now) / 1000)}s inPz=${isPz(w.map, h.x, h.y)} hp=${Math.round((h.character.health / h.stats.maxHealth) * 100)} path=${h.path?.length ?? 0} pos=${h.x},${h.y} routeFail=${Math.round((w.now - (h.brain.routeFailedAt ?? -1e9)) / 1000)}s fightBack=${Math.round((h.brain.fightBackUntil - w.now) / 1000)}s tgt=${h.targetId} mob=${[
            ...w.monsters.values(),
          ]
            .filter((m) => m.alive && m.targetId === h.id)
            .map((m) => m.def.id + '@' + Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y)))
            .join('/')}
`);
    if (allParties(w).length) partySec++;
    maxParty = Math.max(maxParty, ...allParties(w).map((p) => p.members.length), 0);
  }
  const ms = Date.now() - t0;
  const pct = (v: number) => Math.round((v / (minutes * 60)) * 100);
  const out = heroes.map((h) => {
    const n = h.character.name;
    const g = guildOf(w, h.id);
    const top = Object.entries(modes[n]!)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v)}%`)
      .join(' ');
    return `${n.padEnd(12)} ${g === null ? '' : GUILD_NAMES[g].padEnd(6)} nv ${h.character.level} | abates ${kills[n] ?? 0} mortes pk ${pvpDeaths[n] ?? 0} criatura ${mobDeaths[n] ?? 0} | poções ${usablePotionCount(w.data, h.character, 'heal')} ouro ${h.character.gold + h.character.bankGold} | ${top}`;
  });
  const total = Object.values(pvpDeaths).reduce((a, b) => a + b, 0);
  process.stderr.write(
    `\n=== guerra ${mode}, ${minutes} min, ${heroes.length} heróis (simulado em ${(ms / 1000).toFixed(1)} s) ===\n` +
      out.join('\n') +
      `\nMortes por PK: ${total} (${(total / minutes).toFixed(2)}/min) · tempo com grupo: ${pct(partySec)}% · maior grupo: ${maxParty}\n` +
      `Caveiras agora: ${[...w.social.skulls.values()].map((k) => k.kind).join(', ') || 'nenhuma'} · mortes injustas: ${[...w.social.unjust.values()].reduce((a, l) => a + l.length, 0)} · traições: ${betrayals} · grupos agora: ${
        allParties(w)
          .map((p) => p.members.length)
          .join('+') || '-'
      }\n`,
  );
});
