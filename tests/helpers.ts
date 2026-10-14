import { GAME_DATA } from '../src/data';
import { buildWorld } from '../src/data/maps/world';
import type { VocationId } from '../src/domain/value-objects/ids';
import { createCharacter } from '../src/domain/rules/character';
import { createRng } from '../src/domain/value-objects/rng';
import type { LootGenerator } from '../src/domain/rules/loot';
import { GameSimulation } from '../src/game/simulation/GameSimulation';
import type { GameMap } from '../src/game/world/GameMap';

let cachedMap: GameMap | null = null;
/** O mapa é imutável em sua estrutura, mas a simulação altera a ocupação; cada teste recebe uma cópia profunda. */
export function worldMap(): GameMap {
  cachedMap ??= buildWorld();
  return structuredClone(cachedMap);
}

export function makeCharacter(vocation: VocationId = 'knight', name = 'Teste') {
  const map = worldMap();
  return createCharacter(GAME_DATA, { id: `c-${vocation}`, name, vocation, now: 0, position: map.playerStart });
}

export function makeSim(vocation: VocationId = 'knight', opts: { seed?: number; loot?: LootGenerator } = {}) {
  const character = makeCharacter(vocation);
  return new GameSimulation({ data: GAME_DATA, map: worldMap(), character, rng: createRng(opts.seed ?? 42), loot: opts.loot });
}

/** Avança a simulação em passos de `step` ms até a condição ser verdadeira (ou estourar o tempo). */
export function runUntil(sim: GameSimulation, cond: () => boolean, maxMs = 60000, step = 16): boolean {
  let t = 0;
  while (t < maxMs) {
    if (cond()) return true;
    sim.update(step);
    t += step;
  }
  return cond();
}

export const fixedLoot: LootGenerator = { roll: () => ({ items: [{ itemId: 'slime_gel', count: 2 }], gold: 5 }) };

/** Avança a simulação por `ms` em passos de quadro (o update limita quadros longos a 250 ms). */
export function advance(sim: GameSimulation, ms: number, step = 16): void {
  for (let t = 0; t < ms; t += step) sim.update(Math.min(step, ms - t));
}
