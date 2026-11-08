// Cercado (trap): quem não é Knight abre caminho matando a criatura mais fraca do cerco; o Knight gosta do cerco e só
// sai quando está morrendo ou sem poções. Mais a escolha esperta da magia de alvo único (a mais barata que mata).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { heroHelpers, trappedBy } from '../../src/game/ai/heroBrain';
import { spellAverage } from '../../src/game/ai/heroTactics';
import { canEnter, placeOccupant, removeOccupant } from '../../src/game/movement/movement';
import { setTarget } from '../../src/game/combat/combat';
import { asActor } from '../../src/game/simulation/World';
import { refreshStats } from '../../src/game/progression/progression';
import { isPz } from '../../src/game/world/GameMap';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function setup(heroId: string, level = 20) {
  const sim = makeSim('knight', { seed: 7 });
  const w = sim.world;
  const def = D.heroes[heroId]!;
  const c = createCharacter(D, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
  c.level = level;
  if (c.skills.magic) c.skills.magic.level = Math.round(level * (def.vocation === 'sorcerer' || def.vocation === 'druid' ? 0.9 : 0.3)); // (Magic Level de quem chegou lá jogando)
  const h = sim.addHero(def, c) as HeroEntity;
  asActor(w, h, () => refreshStats(w));
  h.character.health = h.stats.maxHealth;
  h.character.mana = h.stats.maxMana;
  sim.teleportPlayer(20, 40); // (o jogador longe da cena)
  // um lugar aberto fora da vila, com as 8 casas em volta livres
  let spot: { x: number; y: number } | null = null;
  for (let y = 34; y < 80 && !spot; y++)
    for (let x = 30; x < 120 && !spot; x++) {
      if (isPz(w.map, x, y) || !canEnter(w, x, y, false)) continue;
      let ok = true;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!canEnter(w, x + dx, y + dy, false) || isPz(w.map, x + dx, y + dy)) ok = false;
      if (ok) spot = { x, y };
    }
  removeOccupant(w, h);
  h.x = spot!.x;
  h.y = spot!.y;
  placeOccupant(w, h);
  return { sim, w, h };
}

/** Cerca o herói com 8 criaturas: todas fortes, menos uma (a mais fraca, com pouca vida). */
function surround(w: ReturnType<typeof setup>['w'], h: HeroEntity): { ring: MonsterEntity[]; weakest: MonsterEntity } {
  const pool = [...w.monsters.values()].filter((m) => m.alive && m.def.attack.range <= 1) as MonsterEntity[];
  const ring: MonsterEntity[] = [];
  let i = 0;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const m = pool[i++]!;
      removeOccupant(w, m as unknown as HeroEntity);
      m.x = h.x + dx;
      m.y = h.y + dy;
      m.homeX = m.x;
      m.homeY = m.y;
      m.hp = 5000;
      m.state = 'attacking';
      m.targetId = h.id;
      placeOccupant(w, m as unknown as HeroEntity);
      ring.push(m);
    }
  const weakest = ring[5]!;
  weakest.hp = 300; // (não cai num golpe só: dá tempo de ver a decisão)
  return { ring, weakest };
}

describe('cercado', () => {
  it('detecta o cerco só quando não há casa livre em volta', () => {
    const { w, h } = setup('maguim');
    expect(trappedBy(w, h)).toBeNull();
    surround(w, h);
    expect(trappedBy(w, h)?.length).toBe(8);
  });

  it('o mago cercado vai na criatura mais fraca para abrir caminho', () => {
    const { sim, w, h } = setup('maguim');
    const { weakest } = surround(w, h);
    advance(sim, 300, 50);
    expect(h.brain.breakoutAt).toBeGreaterThan(0);
    expect(h.targetId === weakest.id || !weakest.alive).toBe(true);
  });

  it('o Knight cheio de vida e poções fica no cerco (bate em todos de uma vez)', () => {
    const { sim, w, h } = setup('boladex');
    surround(w, h);
    for (let t = 0; t < 1500; t += 50) {
      h.character.health = h.stats.maxHealth;
      advance(sim, 50, 50);
    }
    expect(h.brain.breakoutAt).toBe(0);
  });

  it('o Knight morrendo abre caminho pela criatura mais fraca', () => {
    const { sim, w, h } = setup('boladex');
    const { weakest } = surround(w, h);
    for (let t = 0; t < 600 && !h.brain.breakoutAt; t += 50) {
      h.character.health = Math.round(h.stats.maxHealth * 0.3); // (as poções não o tiram do aperto)
      advance(sim, 50, 50);
    }
    expect(h.brain.breakoutAt).toBeGreaterThan(0);
    expect(h.targetId === weakest.id || !weakest.alive).toBe(true);
  });

  it('o Knight sem poções também abre caminho', () => {
    const { sim, w, h } = setup('boladex');
    const { weakest } = surround(w, h);
    h.character.inventory = h.character.inventory.map((st) => (st && D.items[st.itemId]?.use?.heal ? null : st));
    for (let t = 0; t < 600 && !h.brain.breakoutAt; t += 50) {
      h.character.health = h.stats.maxHealth;
      advance(sim, 50, 50);
    }
    expect(h.brain.breakoutAt).toBeGreaterThan(0);
    expect(h.targetId === weakest.id || !weakest.alive).toBe(true);
  });
});

describe('magia esperta', () => {
  it('não gasta magia em quem o golpe básico já derruba', () => {
    const { w, h } = setup('maguim', 30);
    const { weakest } = surround(w, h);
    weakest.hp = 1;
    asActor(w, h, () => setTarget(w, weakest.id));
    expect(heroHelpers.smartStrike(w, h, weakest, ['thunder_strike', 'flame_lance', 'arcane_bolt'])).toBe(false);
  });

  it('usa a magia mais barata que mata, em vez da mais forte', () => {
    const { sim, w, h } = setup('maguim', 30);
    const { weakest } = surround(w, h);
    const casts: string[] = [];
    sim.events.on('spellCast', (e) => {
      if (e.casterId === h.id) casts.push(e.spellId);
    });
    // vida que o golpe básico não derruba e a Faísca Arcana também não; a Lança de Chamas e o Raio derrubam
    weakest.hp = Math.ceil(spellAverage(w, h, 'flame_lance') * 0.85) - 1;
    asActor(w, h, () => setTarget(w, weakest.id));
    h.character.mana = h.stats.maxMana;
    h.brain.breakoutUntil = 0;
    const cast = heroHelpers.smartStrike(w, h, weakest, ['thunder_strike', 'flame_lance', 'arcane_bolt']);
    expect(cast).toBe(true);
    expect(casts.at(-1)).toBe('flame_lance'); // (a mais barata que mata, não o Raio)
  });
});
