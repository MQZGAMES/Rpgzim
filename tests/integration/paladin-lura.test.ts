// Paladin caçando sozinho: lura (junta várias criaturas mais lentas que ele), circula longe delas sem fugir para a
// vila e usa a Chuva de Flechas no bolo.
import { expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { chebyshev } from '../../src/domain/value-objects/position';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { canEnter } from '../../src/game/movement/movement';
import { isPz } from '../../src/game/world/GameMap';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { aggro } from '../../src/game/combat/combat';
import { advance, makeSim } from '../helpers';

/** Campo aberto (11 × 11 livres) longe da vila; todas as criaturas são tiradas do mapa. */
function field(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  for (const m of w.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
  const s0 = w.map.playerStart;
  const free = (x: number, y: number) => canEnter(w, x, y, false, 'x') && !isPz(w.map, x, y) && !w.map.city[y * w.map.width + x];
  for (let r = 25; r < 120; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s0.x + dx;
        const y = s0.y + dy;
        let ok = true;
        for (let ky = -5; ky <= 5 && ok; ky++) for (let kx = -5; kx <= 5 && ok; kx++) ok = free(x + kx, y + ky);
        if (ok) return { x, y };
      }
  throw new Error('sem campo');
}

function put(sim: GameSimulation, a: { x: number; y: number; id: string }, x: number, y: number) {
  const w = sim.world;
  if (w.occupancy.get(a.y * w.map.width + a.x) === a.id) w.occupancy.delete(a.y * w.map.width + a.x);
  a.x = x;
  a.y = y;
  w.occupancy.set(y * w.map.width + x, a.id);
  const m = a as { homeX?: number; homeY?: number };
  if (m.homeX !== undefined) {
    m.homeX = x;
    m.homeY = y;
  }
}

it('lurando sozinho: mantém distância das criaturas, não foge e usa a Chuva de Flechas no bolo', () => {
  const sim = makeSim('knight', { seed: 7 });
  const w = sim.world;
  const def = GAME_DATA.heroes.distanciado!;
  const c = createCharacter(GAME_DATA, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
  c.level = 12;
  c.skills.distance.level = 30;
  c.inventory = c.inventory.map(() => null);
  c.inventory[0] = { itemId: 'potion_health', count: 30 };
  c.inventory[1] = { itemId: 'potion_mana', count: 30 };
  const h = sim.addHero(def, c) as HeroEntity;
  h.character.health = h.stats.maxHealth;
  h.character.mana = h.stats.maxMana;
  const spot = field(sim);
  put(sim, h, spot.x, spot.y);
  // um bolo de criaturas corpo a corpo e lentas, da presa dele, já atrás dele
  const slow = Object.values(GAME_DATA.monsters).find((d) => d.attack.range <= 1 && d.speed < 2 && (d.level ?? 1) <= 6)!;
  const mobs = [...w.monsters.values()].filter((m) => m.def.id === slow.id).slice(0, 4);
  expect(mobs.length).toBe(4);
  mobs.forEach((m: MonsterEntity, i) => {
    m.alive = true;
    m.hp = m.def.health * 3; // dura o bastante para ver o kiting
    put(sim, m, spot.x + 3 + (i % 2), spot.y - 1 + i);
    aggro(w, m, h.id);
  });
  h.brain.mode = 'hunt';
  h.brain.quarry = slow.id;
  h.brain.spot = { ...spot };
  let rain = 0;
  w.events.on('spellCast', (e) => {
    if (e.casterId === h.id && e.spellId === 'arrow_rain') rain++;
  });
  let samples = 0;
  let adjacent = 0;
  const modes = new Set<string>();
  for (let t = 0; t < 20000; t += 250) {
    advance(sim, 250, 50);
    modes.add(h.brain.mode);
    const train = mobs.filter((m) => m.alive && m.targetId === h.id);
    if (!train.length) continue;
    samples++;
    if (train.some((m) => chebyshev(m, h) <= 1)) adjacent++;
  }
  expect(h.dead).toBe(false);
  expect(modes.has('retreat')).toBe(false);
  expect(modes.has('town')).toBe(false);
  expect(samples).toBeGreaterThan(10);
  expect(adjacent / samples).toBeLessThan(0.2);
  expect(rain).toBeGreaterThan(0);
});
