// Ferramenta: os quatro heróis veteranos (nível HERO_LEVEL, padrão 45) soltos por N minutos; mostra onde caçam e em que nível de criatura.
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { partyOf, actorName } from '../../src/game/social/social';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('veteranos', { timeout: 600_000 }, () => {
  const minutes = Number(process.env.HERO_MINUTES ?? 40);
  const level = Number(process.env.HERO_LEVEL ?? 45);
  const sim = makeSim('druid', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  const heroes = Object.values(GAME_DATA.heroes).map((def) => {
    const c = createCharacter(GAME_DATA, {
      id: def.slotId,
      name: def.name,
      vocation: def.vocation,
      now: 0,
      position: w.map.playerStart,
    });
    c.level = level;
    c.bankGold = 60000;
    for (const k of ['sword', 'club', 'axe', 'distance', 'shielding'] as const)
      if (c.skills[k]) c.skills[k].level = Math.round(level * 1.1);
    c.skills.magic.level = Math.round(level / 3);
    const h = sim.addHero(def, c) as HeroEntity;
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    return h;
  });
  const kills: Record<string, number> = {};
  sim.events.on('entityDied', (e) => {
    if (e.kind === 'monster') {
      const m = [...w.monsters.values()].find((x) => x.id === e.entityId);
      if (m) kills[m.def.id] = (kills[m.def.id] ?? 0) + 1;
    }
  });
  const seen = new Map<string, string>();
  const log: string[] = [];
  const t = () =>
    `${String(Math.floor(w.now / 60000)).padStart(2, '0')}:${String(Math.floor((w.now % 60000) / 1000)).padStart(2, '0')}`;
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    for (const h of heroes) {
      const d = `${h.brain.mode}:${h.brain.quarry ?? ''}`;
      if (h.brain.mode === 'hunt' && seen.get(h.id) !== d) {
        seen.set(h.id, d);
        const m = w.data.monsters[h.brain.quarry ?? ''];
        const party = partyOf(w, h.id);
        log.push(
          `${t()} ${h.character.name} (${h.character.vocation} ${h.character.level}) caça ${h.brain.quarry} (nível ${m?.level}) ${party ? 'em grupo ' + party.members.map((id) => actorName(w, id)).join('+') : 'sozinho'}`,
        );
      }
    }
  }
  const dist = Object.entries(kills)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(n${w.data.monsters[k]?.level}) ${v}`)
    .join(', ');
  process.stderr.write(
    log.join('\n') +
      `\n\nMORTES: ${dist}\n` +
      heroes
        .map((h) => `${h.character.name}: nível ${h.character.level} mortes ${h.character.stats.deaths}`)
        .join(' | ') +
      '\n',
  );
});
