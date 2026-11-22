import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { teleport } from '../../src/game/movement/movement';
import { cellIndex } from '../../src/game/world/GameMap';
import { makeSim } from '../helpers';

describe('simulation survives blocked PZ routes', () => {
  it.each(['human', 'hero'] as const)('keeps ticking after %s passes a stationary actor', (actor) => {
    const sim = makeSim('knight', { seed: 17 });
    const w = sim.world;
    const def = GAME_DATA.heroes.boladex!;
    const hero = sim.addHero(
      def,
      createCharacter(GAME_DATA, {
        id: def.slotId,
        name: def.name,
        vocation: def.vocation,
        now: 0,
        position: w.map.playerStart,
      }),
    );
    hero.brain.nextThinkAt = Infinity;
    w.monsters.clear();
    w.occupancy.clear();
    for (let y = 8; y <= 14; y++)
      for (let x = 8; x <= 14; x++) {
        w.map.solid[cellIndex(w.map, x, y)] = 0;
        w.map.pz[cellIndex(w.map, x, y)] = 0;
      }
    const mover = actor === 'human' ? w.human : hero;
    const blocker = actor === 'human' ? hero : w.human;
    teleport(w, mover, 10, 10);
    teleport(w, blocker, 11, 10);
    w.map.pz[cellIndex(w.map, 10, 10)] = 1;
    mover.path = [
      { x: 11, y: 10 },
      { x: 12, y: 10 },
    ];
    mover.pathGoal = { x: 14, y: 10 };
    mover.stuckWith = blocker.id;
    mover.stuckSince = 0;
    mover.stuckAt = 2990;
    w.now = 2990;
    expect(() => sim.update(16)).not.toThrow();
    expect([mover.x, mover.y]).toEqual([12, 10]);
    expect([blocker.x, blocker.y]).toEqual([11, 10]);
    const now = w.now;
    expect(() => sim.update(16)).not.toThrow();
    expect(w.now).toBeGreaterThan(now);
    expect(w.player).toBe(w.human);
    for (let i = 0; i < 100; i++) sim.update(16);
    expect([mover.x, mover.y]).toEqual([14, 10]);
  });
});
