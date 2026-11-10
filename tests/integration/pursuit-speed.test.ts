import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { chebyshev } from '../../src/domain/value-objects/position';
import { actorSpeed } from '../../src/game/movement/follow';
import { canEnter } from '../../src/game/movement/movement';
import { acceptInvite, configureParty, invite } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { isPz } from '../../src/game/world/GameMap';
import { refreshStats } from '../../src/game/progression/progression';
import { advance, makeSim } from '../helpers';

function setup() {
  const sim = makeSim();
  const w = sim.world;
  const hero = GAME_DATA.heroes.boladex!;
  const h = sim.addHero(
    hero,
    createCharacter(GAME_DATA, {
      id: hero.slotId,
      name: hero.name,
      vocation: 'knight',
      now: 0,
      position: w.map.playerStart,
    }),
  );
  h.brain.nextThinkAt = Infinity;
  for (const m of w.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
  const s = w.map.playerStart;
  for (let r = 6; r < 70; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s.x + dx,
          y = s.y + dy;
        if (
          !Array.from({ length: 38 }, (_, k) => x + k).every(
            (xx) =>
              canEnter(w, xx, y, false, 'test') && !isPz(w.map, xx, y) && !w.map.city[y * w.map.width + xx],
          )
        )
          continue;
        sim.teleportPlayer(x, y);
        asActor(w, h, () => sim.teleportPlayer(x + 3, y));
        w.human.nextAttackAt = Infinity;
        h.nextAttackAt = Infinity;
        return { sim, w, h, x, y };
      }
  }
  throw new Error('No runway');
}

describe('movement speed and player pursuit', () => {
  it('does not grant the party catch-up speed to manual movement or escape paths', () => {
    const { w, h } = setup();
    invite(w, h.id, w.human.id);
    acceptInvite(w, w.human.id, h.id);
    configureParty(w, h.id, { formation: 'follow' });
    w.human.following = false;
    expect(actorSpeed(w, w.human)).toBe(w.human.stats.speed);
    w.human.heldDir = { dx: -1, dy: 0 };
    expect(actorSpeed(w, w.human)).toBe(w.human.stats.speed);
  });
  it.each(['held', 'map'] as const)(
    'closes a three-tile gap against an equal-speed fleeing player (%s)',
    (mode) => {
      const { sim, w, h, x, y } = setup();
      expect(h.stats.speed).toBe(w.human.stats.speed);
      sim.setPvp(true);
      sim.setTarget(h.id);
      if (mode === 'held') h.heldDir = { dx: 1, dy: 0 };
      else
        asActor(w, h, () => {
          expect(sim.walkTo(x + 36, y)).toBe(true);
        });
      let closest = Infinity;
      let lateWorst = 0;
      for (let t = 0; t < 9000; t += 50) {
        sim.update(50);
        const d = chebyshev(w.human, h);
        closest = Math.min(closest, d);
        if (t >= 7000) lateWorst = Math.max(lateWorst, d);
      }
      expect(h.x - x).toBeGreaterThan(20);
      expect(closest).toBe(1);
      expect(lateWorst).toBeLessThanOrEqual(2);
    },
  );
  it('keeps map clicks and directional controls at the same speed', () => {
    const a = setup(),
      b = setup();
    a.sim.setMoveDir({ dx: 1, dy: 0 });
    // Move the obstacle out of the runway before comparing the two controls.
    asActor(a.w, a.h, () => a.sim.teleportPlayer(a.x + 36, a.y));
    asActor(b.w, b.h, () => b.sim.teleportPlayer(b.x + 36, b.y));
    expect(b.sim.walkTo(b.x + 30, b.y)).toBe(true);
    advance(a.sim, 3000, 50);
    advance(b.sim, 3000, 50);
    expect(a.w.human.x - a.x).toBe(b.w.human.x - b.x);
    expect(a.w.human.move?.duration).toBe(b.w.human.move?.duration);
  });
  it('catches lower-level targets and also works for an AI pursuer', () => {
    const { sim, w, h, x, y } = setup();
    w.human.character.level = 10;
    refreshStats(w);
    sim.setPvp(true);
    sim.setTarget(h.id);
    h.heldDir = { dx: 1, dy: 0 };
    let closest = Infinity;
    for (let t = 0; t < 7000; t += 16) {
      sim.update(16);
      closest = Math.min(closest, chebyshev(w.human, h));
    }
    expect(closest).toBe(1);

    const other = setup();
    other.sim.setPvp(true);
    // Reverse the roles: human flees by map, AI pursues via the same movement system.
    asActor(other.w, other.h, () => other.sim.teleportPlayer(other.x + 36, other.y));
    other.sim.teleportPlayer(other.x + 3, other.y);
    asActor(other.w, other.h, () => other.sim.teleportPlayer(other.x, other.y));
    expect(other.sim.walkTo(other.x + 36, other.y)).toBe(true);
    asActor(other.w, other.h, () => other.sim.setTarget(other.w.human.id));
    closest = Infinity;
    for (let t = 0; t < 9000; t += 50) {
      other.sim.update(50);
      closest = Math.min(closest, chebyshev(other.w.human, other.h));
    }
    expect(closest).toBe(1);
    expect(h.x - x).toBeGreaterThan(15);
    expect(w.human.y).toBe(y);
  });
  it.each(['haste', 'slow'] as const)('preserves genuine speed advantages (%s)', (effect) => {
    const { sim, w, h } = setup();
    if (effect === 'haste') {
      h.buffs.push({ kind: 'haste', value: 0.7, expiresAt: w.now + 30000, sourceSpell: 'haste' });
      asActor(w, h, () => refreshStats(w));
    } else {
      w.human.slowUntil = w.now + 30000;
      w.human.slowFactor = 0.5;
    }
    sim.setPvp(true);
    sim.setTarget(h.id);
    h.heldDir = { dx: 1, dy: 0 };
    advance(sim, 4000, 50);
    expect(chebyshev(w.human, h)).toBeGreaterThan(3);
  });
  it('removes formation speed as soon as the player picks a map destination', () => {
    const { sim, w, h, x, y } = setup();
    invite(w, h.id, w.human.id);
    acceptInvite(w, w.human.id, h.id);
    configureParty(w, h.id, { formation: 'follow' });
    w.human.following = true;
    expect(sim.walkTo(x + 30, y)).toBe(true);
    expect(w.human.following).toBe(false);
    sim.update(16);
    expect(w.human.move?.duration).toBeCloseTo(1000 / w.human.stats.speed);
  });
});
