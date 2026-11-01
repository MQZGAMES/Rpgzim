// PK em grupo: os colegas não ficam só no ataque básico — cada vocação usa as magias de ataque contra o personagem que o
// líder ataca (lentidão em quem foge, a de mais dano no resto) e bebe poção quando é ela quem apanha.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import type { HeroEntity } from '../../src/game/entities/types';
import { canEnter } from '../../src/game/movement/movement';
import { acceptInvite, configureParty, invite } from '../../src/game/social/social';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { isPz } from '../../src/game/world/GameMap';
import { asActor } from '../../src/game/simulation/World';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function addHero(sim: GameSimulation, id: string, level: number): HeroEntity {
  const def = D.heroes[id]!;
  const c = createCharacter(D, {
    id: def.slotId,
    name: def.name,
    vocation: def.vocation,
    now: 0,
    position: sim.world.map.playerStart,
  });
  c.level = level;
  const h = sim.addHero(def, c) as HeroEntity;
  h.character.mana = h.stats.maxMana;
  h.character.health = h.stats.maxHealth;
  return h;
}

/** Campo aberto longe de criaturas e de áreas protegidas. */
function field(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  for (const m of w.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
  const s0 = w.map.playerStart;
  for (let r = 8; r < 70; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s0.x + dx;
        const y = s0.y + dy;
        let ok = true;
        for (let ky = -3; ky <= 3 && ok; ky++)
          for (let kx = -3; kx <= 6 && ok; kx++)
            ok =
              canEnter(w, x + kx, y + ky, false, 'x') &&
              !isPz(w.map, x + kx, y + ky) &&
              !w.map.city[(y + ky) * w.map.width + x + kx];
        if (ok) return { x, y };
      }
  throw new Error('sem campo');
}

describe('PK em grupo com magias', () => {
  for (const [helperId, foeId] of [
    ['boladex', 'maguim'],
    ['maguim', 'boladex'],
    ['mano_cura', 'boladex'],
    ['distanciado', 'boladex'],
  ] as const)
    it(`${helperId} usa magias de ataque no alvo do líder (não só o ataque básico)`, () => {
      const sim = makeSim('knight', { seed: 21 });
      const w = sim.world;
      const at = field(sim);
      w.human.character.level = 30;
      const h = addHero(sim, helperId, 30);
      const foe = addHero(sim, foeId, 30);
      foe.brain.nextThinkAt = Infinity; // a vítima fica parada (só apanha)
      foe.character.health = foe.stats.maxHealth = 1e6;
      sim.teleportPlayer(at.x, at.y);
      asActor(w, h, () => sim.teleportPlayer(at.x - 1, at.y + 1));
      asActor(w, foe, () => sim.teleportPlayer(at.x + 2, at.y));
      invite(w, w.human.id, h.id);
      acceptInvite(w, h.id, w.human.id);
      configureParty(w, w.human.id, { formation: 'follow' });
      sim.setPvp(true);
      const casts: string[] = [];
      w.events.on('spellCast', (e) => {
        if (e.casterId === h.id && D.spells[e.spellId]?.effect === 'damage') casts.push(e.spellId);
      });
      sim.setTarget(foe.id);
      h.brain.nextThinkAt = 0;
      for (let t = 0; t < 10000; t += 100) {
        advance(sim, 100, 50);
        w.human.character.health = w.human.stats.maxHealth;
      }
      expect(h.targetId).toBe(foe.id);
      expect(casts.length, `${helperId}: ${casts.join(',')}`).toBeGreaterThanOrEqual(3);
    });

  it('a vítima que foge leva primeiro a magia que deixa lento', () => {
    const sim = makeSim('knight', { seed: 22 });
    const w = sim.world;
    const at = field(sim);
    const h = addHero(sim, 'mano_cura', 30);
    const foe = addHero(sim, 'boladex', 30);
    foe.brain.nextThinkAt = Infinity;
    sim.teleportPlayer(at.x, at.y);
    asActor(w, h, () => sim.teleportPlayer(at.x - 1, at.y));
    asActor(w, foe, () => sim.teleportPlayer(at.x + 3, at.y));
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    sim.setPvp(true);
    sim.setTarget(foe.id);
    advance(sim, 600, 50);
    foe.character.health = Math.floor(foe.stats.maxHealth * 0.3); // quase morto: vai fugir
    let slowed = false;
    for (let t = 0; t < 4000 && !slowed; t += 100) {
      advance(sim, 100, 50);
      slowed = w.now < foe.slowUntil;
    }
    expect(slowed).toBe(true);
  });
});
