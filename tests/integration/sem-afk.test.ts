// Heróis não ficam AFK: nem ao terminar a visita à vila, nem depois de morrer (o jogo "de verdade", com sessões).
import { expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import type { HeroEntity } from '../../src/game/entities/types';
import { advance, makeSim } from '../helpers';

it('no modo realista, nenhum herói fica AFK parado no mundo (20 min de jogo, com idas à vila)', { timeout: 120_000 }, () => {
  const sim = makeSim('knight', { seed: 11 });
  const w = sim.world;
  w.lifelike = true;
  const heroes = Object.values(GAME_DATA.heroes).map(
    (def) =>
      sim.addHero(
        def,
        createCharacter(GAME_DATA, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart }),
      ) as HeroEntity,
  );
  let afk = 0;
  let townVisits = 0;
  const wasTown = new Map<string, boolean>();
  for (let s = 0; s < 20 * 60; s += 5) {
    advance(sim, 5000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    for (const h of heroes) {
      if (h.brain.human.afkUntil > w.now) afk++;
      const town = h.brain.mode === 'town';
      if (town && !wasTown.get(h.id)) townVisits++;
      wasTown.set(h.id, town);
    }
  }
  expect(townVisits).toBeGreaterThan(0); // passaram pela vila (onde antes às vezes ficavam AFK)
  expect(afk).toBe(0);
});
