// Grupo com você de líder: os heróis não fogem nem vão à vila sozinhos (só avisam das poções), não saem do grupo com
// você parado, vêm até você quando chamados; o Knight segura as criaturas e o Druid cura antes de atacar.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { chebyshev } from '../../src/domain/value-objects/position';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { canEnter } from '../../src/game/movement/movement';
import { acceptInvite, configureParty, invite, partyOf } from '../../src/game/social/social';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { isPz } from '../../src/game/world/GameMap';
import { asActor } from '../../src/game/simulation/World';
import { aggro } from '../../src/game/combat/combat';
import { advance, makeSim } from '../helpers';

function withHero(id: string, seed = 31) {
  const sim = makeSim('knight', { seed });
  const def = GAME_DATA.heroes[id]!;
  const c = createCharacter(GAME_DATA, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: sim.world.map.playerStart });
  const h = sim.addHero(def, c) as HeroEntity;
  return { sim, w: sim.world, h };
}

/** Campo aberto longe da vila e de criaturas (todas as criaturas são tiradas do mapa). */
function field(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  for (const m of w.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
  const s0 = w.map.playerStart;
  const free = (x: number, y: number) => canEnter(w, x, y, false, 'x') && !isPz(w.map, x, y) && !w.map.city[y * w.map.width + x];
  for (let r = 25; r < 90; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s0.x + dx;
        const y = s0.y + dy;
        let ok = true;
        for (let ky = -3; ky <= 3 && ok; ky++) for (let kx = -3; kx <= 3 && ok; kx++) ok = free(x + kx, y + ky);
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

function setup(id: string) {
  const { sim, w, h } = withHero(id);
  const spot = field(sim);
  sim.teleportPlayer(spot.x, spot.y);
  asActor(w, h, () => sim.teleportPlayer(spot.x - 2, spot.y));
  invite(w, w.human.id, h.id);
  acceptInvite(w, h.id, w.human.id);
  configureParty(w, w.human.id, { formation: 'follow' });
  h.character.level = 20;
  h.character.inventory = h.character.inventory.map(() => null);
  h.character.inventory[0] = { itemId: 'potion_health', count: 3 };
  const speech: { key?: string; name: string }[] = [];
  w.events.on('speech', (e) => speech.push({ key: e.key, name: e.name }));
  return { sim, w, h, spot, speech };
}

/** Criaturas batendo no herói: as de golpe mais forte que ainda não o matam de uma vez (golpe até 12% da vida). */
function mobOn(sim: GameSimulation, h: HeroEntity, n: number): MonsterEntity[] {
  const w = sim.world;
  const cap = h.stats.maxHealth * 0.12;
  const all = [...w.monsters.values()].filter((m) => m.def.attack.max <= cap && m.def.attack.kind !== 'ranged').sort((a, c) => c.def.attack.max - a.def.attack.max);
  const out: MonsterEntity[] = [];
  const cells = [[1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1]];
  for (const m of all) {
    if (out.length >= n) break;
    const [dx, dy] = cells[out.length]!;
    m.alive = true;
    m.hp = m.def.health;
    put(sim, m, h.x + dx!, h.y + dy!);
    aggro(w, m, h.id);
    out.push(m);
  }
  return out;
}

describe('grupo com você de líder', () => {
  it('com poucas poções e apanhando, o herói não foge nem vai à vila: fica perto e avisa das poções', () => {
    const { sim, w, h, speech } = setup('maguim');
    mobOn(sim, h, 3);
    h.character.health = Math.round(h.stats.maxHealth * 0.3);
    const modes = new Set<string>();
    let maxDist = 0;
    for (let t = 0; t < 8000; t += 100) {
      advance(sim, 100, 50);
      if (h.dead) break;
      modes.add(h.brain.mode);
      maxDist = Math.max(maxDist, chebyshev(h, w.human));
    }
    expect(modes.has('retreat')).toBe(false);
    expect(modes.has('town')).toBe(false);
    expect(partyOf(w, h.id)?.members).toContain(w.human.id);
    expect(maxDist).toBeLessThanOrEqual(8);
    expect(speech.some((s) => s.key === 'potionsWarning')).toBe(true);
  });

  it('sem poção nenhuma e fora da vila, segue você em vez de ir reabastecer', () => {
    const { sim, w, h, spot, speech } = setup('boladex');
    h.character.inventory[0] = null;
    advance(sim, 3000, 50);
    sim.teleportPlayer(spot.x + 3, spot.y);
    advance(sim, 6000, 50);
    expect(h.brain.mode).toBe('follow');
    expect(chebyshev(h, w.human)).toBeLessThanOrEqual(4);
    expect(speech.some((s) => s.key === 'potionsWarning')).toBe(true);
  });

  it('com você parado por 5 minutos, continua no grupo', () => {
    const { sim, w, h } = setup('distanciado');
    h.character.inventory[0] = { itemId: 'potion_health', count: 50 };
    advance(sim, 5 * 60000 + 5000, 250);
    expect(partyOf(w, h.id)?.members).toContain(w.human.id);
  });

  it('chamado por você, vem até você mesmo se tinha ido à vila', () => {
    const { sim, w, h } = setup('boladex');
    h.character.inventory[0] = { itemId: 'potion_health', count: 50 };
    h.brain.mode = 'town';
    expect(sim.partyCall(h.id)).toBe(true);
    advance(sim, 20000, 50);
    expect(chebyshev(h, w.human)).toBeLessThanOrEqual(3);
    expect(h.brain.mode === 'town' || h.brain.mode === 'retreat').toBe(false);
  });

  it('o Druid cura você antes de atacar', () => {
    const { sim, w, h } = setup('mano_cura');
    h.character.inventory[0] = { itemId: 'potion_health', count: 50 };
    h.character.mana = h.stats.maxMana = 800;
    h.character.skills.magic.level = 20;
    const p = w.human;
    p.character.health = Math.round(p.stats.maxHealth * 0.6);
    const before = p.character.health;
    advance(sim, 3000, 50);
    expect(p.character.health).toBeGreaterThan(before);
  });

  it('o Knight segura as criaturas: mantém o Brado de Ferro e não recua', () => {
    const { sim, h } = setup('boladex');
    h.character.inventory[0] = { itemId: 'potion_health', count: 2 };
    h.character.mana = h.stats.maxMana = 600;
    mobOn(sim, h, 2);
    const modes = new Set<string>();
    for (let t = 0; t < 4000; t += 100) {
      advance(sim, 100, 50);
      modes.add(h.brain.mode);
    }
    expect(modes.has('retreat')).toBe(false);
    expect(h.dead || h.buffs.some((b) => b.kind === 'defense')).toBe(true);
  });
});
