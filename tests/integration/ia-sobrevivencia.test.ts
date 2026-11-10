// Sobrevivência "de gente": o herói não morre parado. Atirador de longe conta como ameaça, a fuga anda de verdade
// (trechos curtos para longe do bolo), ele sai quando a vida não sobe ou a criatura mata em dois golpes, e o mago
// espera a mana voltar antes de puxar a próxima.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { heroHelpers } from '../../src/game/ai/heroBrain';
import { escapePath } from '../../src/game/ai/heroEscape';
import { heroDpsVs } from '../../src/game/ai/heroThreat';
import { placeOccupant, removeOccupant } from '../../src/game/movement/movement';
import { asActor } from '../../src/game/simulation/World';
import { refreshStats } from '../../src/game/progression/progression';
import { isPz, isSolid } from '../../src/game/world/GameMap';
import { chebyshev } from '../../src/domain/value-objects/position';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function setup(heroId: string, level = 20) {
  const sim = makeSim('knight', { seed: 7 });
  const w = sim.world;
  const def = D.heroes[heroId]!;
  const c = createCharacter(D, {
    id: def.slotId,
    name: def.name,
    vocation: def.vocation,
    now: 0,
    position: w.map.playerStart,
  });
  c.level = level;
  if (c.skills.magic)
    c.skills.magic.level = Math.round(
      level * (def.vocation === 'sorcerer' || def.vocation === 'druid' ? 0.9 : 0.3),
    );
  const h = sim.addHero(def, c) as HeroEntity;
  asActor(w, h, () => refreshStats(w));
  h.character.health = h.stats.maxHealth;
  h.character.mana = h.stats.maxMana;
  sim.teleportPlayer(20, 40); // (o jogador longe da cena)
  // um lugar aberto fora da vila (7 casas sem obstáculo para cada lado), limpo das criaturas que moravam ali
  let spot: { x: number; y: number } | null = null;
  for (let y = 12; y < w.map.height - 12 && !spot; y++)
    for (let x = 60; x < w.map.width - 12 && !spot; x++) {
      let ok = true;
      for (let dx = -7; dx <= 7 && ok; dx++)
        for (let dy = -7; dy <= 7 && ok; dy++)
          if (isSolid(w.map, x + dx, y + dy) || isPz(w.map, x + dx, y + dy)) ok = false;
      if (ok) spot = { x, y };
    }
  for (const m of w.monsters.values())
    if (m.alive && chebyshev(m, spot!) <= 12) {
      removeOccupant(w, m as unknown as HeroEntity);
      m.alive = false;
      m.respawnAt = Infinity;
    }
  removeOccupant(w, h);
  h.x = spot!.x;
  h.y = spot!.y;
  placeOccupant(w, h);
  return { sim, w, h };
}

/** Coloca uma criatura (da espécie pedida, ou qualquer corpo a corpo) numa casa, já atacando o herói. */
function put(
  w: ReturnType<typeof setup>['w'],
  h: HeroEntity,
  dx: number,
  dy: number,
  pick: (m: MonsterEntity) => boolean,
  used: Set<string>,
): MonsterEntity {
  const m = [...w.monsters.values()].find((x) => x.alive && !used.has(x.id) && pick(x))!;
  used.add(m.id);
  removeOccupant(w, m as unknown as HeroEntity);
  m.x = h.x + dx;
  m.y = h.y + dy;
  m.homeX = m.x;
  m.homeY = m.y;
  m.state = 'attacking';
  m.targetId = h.id;
  placeOccupant(w, m as unknown as HeroEntity);
  return m;
}

const melee = (m: MonsterEntity) => m.def.attack.range <= 1;
const potions = (h: HeroEntity) =>
  h.character.inventory.reduce((s, st) => s + (st?.itemId.startsWith('potion_health') ? st.count : 0), 0);

describe('ameaça à distância', () => {
  it('atirador a 5 tiles conta como atacante: bebe a poção sem esperar a vida chegar a 25%', () => {
    const { w, h } = setup('boladex');
    const used = new Set<string>();
    const shooter = put(w, h, 5, 0, (m) => m.def.attack.range >= 5, used);
    expect(chebyshev(shooter, h)).toBe(5);
    h.character.health = Math.round(h.stats.maxHealth * 0.4);
    const before = potions(h);
    asActor(w, h, () => heroHelpers.survive(w, h)); // percebeu
    w.now += 1500;
    asActor(w, h, () => heroHelpers.survive(w, h)); // reagiu
    expect(potions(h)).toBeLessThan(before);
  });
});

describe('fuga que anda', () => {
  it('cercado com uma brecha, em fuga, sai pela brecha em vez de ficar lutando', () => {
    const { sim, w, h } = setup('maguim');
    const used = new Set<string>();
    // seis criaturas fortes em volta; as duas casas a oeste ficam livres
    for (const [dx, dy] of [
      [1, -1],
      [1, 0],
      [1, 1],
      [0, -1],
      [0, 1],
      [-1, 1],
    ] as const)
      put(w, h, dx, dy, melee, used).hp = 50000;
    const from = { x: h.x, y: h.y };
    h.brain.mode = 'retreat';
    h.brain.retreatWhy = 'teste';
    for (let t = 0; t < 3000; t += 50) {
      h.character.health = h.stats.maxHealth; // (o que se mede é o movimento)
      advance(sim, 50, 50);
    }
    expect(chebyshev(h, from)).toBeGreaterThanOrEqual(3);
  });

  it('escapePath: sai pela brecha e termina longe de quem persegue; sem saída, null', () => {
    const { w, h } = setup('maguim');
    const used = new Set<string>();
    const ring: MonsterEntity[] = [];
    for (const [dx, dy] of [
      [1, -1],
      [1, 0],
      [1, 1],
      [0, -1],
      [0, 1],
      [-1, 1],
      [-1, -1],
    ] as const)
      ring.push(put(w, h, dx, dy, melee, used));
    const path = escapePath(w, h, ring, null)!;
    expect(path[0]).toEqual({ x: h.x - 1, y: h.y });
    const end = path[path.length - 1]!;
    expect(Math.min(...ring.map((m) => chebyshev(m, end)))).toBeGreaterThanOrEqual(3);
    ring.push(put(w, h, -1, 0, melee, used)); // fecha o cerco
    expect(escapePath(w, h, ring, null)).toBeNull();
  });
});

describe('sair antes de morrer', () => {
  it('criatura que tira metade da vida num golpe: foge na hora, mesmo com a vida cheia', () => {
    const { w, h } = setup('maguim', 8);
    const strongest = [...w.monsters.values()]
      .filter((m) => m.alive && melee(m))
      .sort((a, b) => b.def.attack.max - a.def.attack.max)[0]!;
    expect(strongest.def.attack.max).toBeGreaterThan(h.stats.maxHealth); // (um golpe destes mata o novato)
    put(w, h, 1, 0, (m) => m.id === strongest.id, new Set());
    h.brain.mode = 'hunt';
    asActor(w, h, () => heroHelpers.survive(w, h));
    expect(h.brain.mode).toBe('retreat');
    expect(h.brain.retreatWhy).toContain('letal');
    expect(h.brain.avoid[strongest.def.id]).toBeGreaterThan(w.now);
  });

  it('vida baixa que não sobe, mesmo com poções: sai dali', () => {
    const { w, h } = setup('boladex', 30);
    const used = new Set<string>();
    // duas criaturas fracas (a régua acha a luta folgada), mas a vida está presa lá embaixo
    // (cada uma leva ~4 s para cair: a luta não acaba já)
    for (const dx of [-1, 1]) {
      const m = put(w, h, dx, 0, (x) => x.def.id === 'wolf', used);
      m.hp = Math.round(heroDpsVs(w, h, m) * 4);
    }
    h.brain.mode = 'hunt';
    h.brain.bold = 1;
    for (let t = 0; t < 4000 && (h.brain.mode as string) !== 'retreat'; t += 300) {
      h.character.health = Math.round(h.stats.maxHealth * 0.3);
      asActor(w, h, () => heroHelpers.survive(w, h));
      w.now += 300;
    }
    expect(h.brain.mode).toBe('retreat');
    expect(h.brain.retreatWhy).toContain('sangrando');
  });
});

describe('vida despencando', () => {
  it('perdeu 40% da vida em 3 s com duas criaturas batendo: sai, mesmo com a régua folgada', () => {
    const { w, h } = setup('boladex', 30);
    const used = new Set<string>();
    for (const dx of [-1, 1]) {
      const m = put(w, h, dx, 0, (x) => x.def.id === 'wolf', used);
      m.hp = Math.round(heroDpsVs(w, h, m) * 4);
    }
    h.brain.mode = 'hunt';
    h.brain.bold = 1;
    asActor(w, h, () => heroHelpers.survive(w, h)); // vida cheia
    expect(h.brain.mode).toBe('hunt');
    w.now += 1500;
    h.character.health = Math.round(h.stats.maxHealth * 0.55);
    asActor(w, h, () => heroHelpers.survive(w, h));
    expect(h.brain.mode).toBe('retreat');
    expect(h.brain.retreatWhy).toContain('despencando');
  });
});

describe('mago e mana', () => {
  function hunting(mana: number) {
    const { w, h } = setup('maguim', 15);
    // uma criatura fraca e sozinha, parada a 3 tiles (a régua aprova com folga)
    const prey = put(w, h, 3, 0, (m) => m.def.id === 'slime', new Set());
    prey.state = 'idle';
    prey.targetId = null;
    h.brain.mode = 'hunt';
    h.brain.quarry = 'slime';
    h.brain.spot = { x: prey.x, y: prey.y };
    h.brain.modeUntil = w.now + 600000;
    h.character.inventory = h.character.inventory.map((st) =>
      st && D.items[st.itemId]?.use?.mana && !D.items[st.itemId]?.use?.heal ? null : st,
    );
    h.character.mana = Math.round(h.stats.maxMana * mana);
    h.targetId = null;
    asActor(w, h, () => heroHelpers.huntTick(w, h));
    return { h, prey };
  }

  it('com mana, puxa a criatura', () => {
    const { h, prey } = hunting(1);
    expect(h.targetId).toBe(prey.id);
  });

  it('sem mana (e sem poção de mana), espera antes de puxar a próxima', () => {
    const { h } = hunting(0.1);
    expect(h.targetId).toBeNull();
    expect(h.brain.manaRest).toBe(true);
  });
});
