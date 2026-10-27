// Seguir o líder e perseguir sem travar, PK do grupo segue o líder, Corrida pela metade e jogar item no chão.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { chebyshev } from '../../src/domain/value-objects/position';
import type { HeroEntity } from '../../src/game/entities/types';
import { canEnter } from '../../src/game/movement/movement';
import { acceptInvite, configureParty, invite } from '../../src/game/social/social';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { isPz } from '../../src/game/world/GameMap';
import { asActor } from '../../src/game/simulation/World';
import { advance, makeSim } from '../helpers';

function withHero(id = 'boladex', seed = 31) {
  const sim = makeSim('knight', { seed });
  const hero = GAME_DATA.heroes[id]!;
  const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: sim.world.map.playerStart });
  const h = sim.addHero(hero, c) as HeroEntity;
  return { sim, w: sim.world, h };
}

/** Faixa de campo aberto (1 × 38 tiles ao leste) longe de criaturas e de áreas protegidas. */
function runway(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  for (const m of w.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
  const s0 = w.map.playerStart;
  for (let r = 6; r < 70; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s0.x + dx;
        const y = s0.y + dy;
        let ok = true;
        for (let k = -3; k <= 34 && ok; k++) ok = canEnter(w, x + k, y, false, 'x') && !isPz(w.map, x + k, y) && !w.map.city[y * w.map.width + x + k];
        if (ok) return { x, y };
      }
  throw new Error('sem pista');
}

const partyUp = (w: ReturnType<typeof withHero>['w'], h: HeroEntity) => {
  invite(w, w.human.id, h.id);
  acceptInvite(w, h.id, w.human.id);
  configureParty(w, w.human.id, { formation: 'follow' });
};

describe('Corrida pela metade', () => {
  it('a Corrida dá +0,7 de velocidade (era +1,4) e continua renovável', () => {
    expect(GAME_DATA.spells.haste!.buff!.value).toBeCloseTo(0.7);
    const sim = makeSim('knight');
    const base = sim.world.player.stats.speed;
    sim.world.player.character.level = 10;
    sim.world.player.character.mana = 999;
    expect(sim.castSpell('haste')).toBe(true);
    expect(sim.world.player.stats.speed - base).toBeCloseTo(0.7);
  });
});

describe('seguir o líder sem travar', () => {
  it('o herói acompanha o jogador andando em linha reta: nunca fica a mais de 4 tiles depois de alcançar', () => {
    const { sim, w, h } = withHero();
    const spot = runway(sim);
    sim.teleportPlayer(spot.x, spot.y);
    asActor(w, h, () => sim.teleportPlayer(spot.x - 2, spot.y));
    partyUp(w, h);
    h.brain.nextThinkAt = 0;
    advance(sim, 1500, 50);
    w.human.heldDir = { dx: 1, dy: 0 };
    let worst = 0;
    for (let t = 0; t < 9000; t += 100) {
      advance(sim, 100, 50);
      if (t > 2000) worst = Math.max(worst, chebyshev(w.human, h));
    }
    expect(w.human.x - spot.x).toBeGreaterThan(15); // o jogador andou de verdade
    expect(worst).toBeLessThanOrEqual(4);
  });

  it('com Corrida ativa no líder, o seguidor ainda acompanha (fôlego proporcional) sem se perder', () => {
    const { sim, w, h } = withHero();
    const spot = runway(sim);
    sim.teleportPlayer(spot.x, spot.y);
    asActor(w, h, () => sim.teleportPlayer(spot.x - 2, spot.y));
    partyUp(w, h);
    w.human.character.level = 10;
    w.human.character.mana = 999;
    sim.castSpell('haste');
    w.human.heldDir = { dx: 1, dy: 0 };
    let worst = 0;
    for (let t = 0; t < 7500; t += 100) {
      advance(sim, 100, 50);
      if (t > 3000) worst = Math.max(worst, chebyshev(w.human, h));
    }
    expect(worst).toBeLessThanOrEqual(7);
  });
});

describe('perseguição do alvo', () => {
  it('chega no alvo parado sem pausas: 8 tiles em até 4 s', () => {
    const sim = makeSim('knight', { seed: 4 });
    const w = sim.world;
    const spot = runway(sim);
    for (const m of w.monsters.values()) {
      m.alive = false;
      m.respawnAt = Infinity;
    }
    sim.teleportPlayer(spot.x, spot.y);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    m.hp = 1e6;
    w.occupancy.delete(m.y * w.map.width + m.x);
    m.x = spot.x + 8;
    m.y = spot.y;
    w.occupancy.set(m.y * w.map.width + m.x, m.id);
    m.state = 'idle';
    m.def = { ...m.def, aggroRadius: 0 };
    sim.setTarget(m.id);
    let t = 0;
    while (chebyshev(w.player, m) > 1 && t < 6000) {
      advance(sim, 50, 50);
      t += 50;
    }
    expect(t).toBeLessThanOrEqual(4000); // 7 passos a ~3 tiles/s ≈ 2,3 s
  });
});

describe('PK do grupo segue o líder', () => {
  it('o herói em grupo ataca o personagem que o líder ataca; sem PK nada acontece', () => {
    const { sim, w, h } = withHero('boladex', 12);
    const hero2 = GAME_DATA.heroes.maguim!;
    const spot = runway(sim);
    const foe = sim.addHero(hero2, createCharacter(GAME_DATA, { id: hero2.slotId, name: hero2.name, vocation: hero2.vocation, now: 0, position: w.map.playerStart })) as HeroEntity;
    foe.brain.nextThinkAt = Infinity;
    sim.teleportPlayer(spot.x, spot.y);
    asActor(w, h, () => sim.teleportPlayer(spot.x - 1, spot.y));
    asActor(w, foe, () => sim.teleportPlayer(spot.x + 3, spot.y));
    partyUp(w, h);
    // PK desligado: o líder não consegue mirar e o herói não escolhe vítimas sozinho
    sim.setTarget(foe.id);
    advance(sim, 1500, 50);
    expect(h.targetId).not.toBe(foe.id);
    // PK ligado: o líder mira, o herói ataca o mesmo alvo
    sim.setPvp(true);
    sim.setTarget(foe.id);
    h.brain.nextThinkAt = 0;
    advance(sim, 2000, 50);
    expect(w.human.targetId).toBe(foe.id);
    expect(h.targetId).toBe(foe.id);
    // o líder solta o alvo: o herói também solta
    sim.setTarget(null);
    advance(sim, 1500, 50);
    expect(h.targetId).not.toBe(foe.id);
  });
});

describe('jogar o item no chão', () => {
  it('vira um saco embaixo do pé; jogar mais itens soma no mesmo saco; dá para pegar de volta', () => {
    const sim = makeSim('knight', { seed: 2 });
    const w = sim.world;
    const p = w.player;
    const inv = p.character.inventory;
    inv.fill(null);
    inv[0] = { itemId: 'potion_health', count: 3 };
    inv[1] = { itemId: 'slime_gel', count: 5 };
    inv[2] = { itemId: 'potion_health', count: 2 };
    sim.drop(0);
    const bags = () => [...w.lootBags.values()].filter((b) => b.dropped);
    expect(bags()).toHaveLength(1);
    expect(bags()[0]).toMatchObject({ x: p.x, y: p.y });
    expect(inv[0]).toBeNull();
    sim.drop(1);
    sim.drop(2);
    expect(bags()).toHaveLength(1); // tudo no mesmo saco
    const bag = bags()[0]!;
    expect(bag.items.find((s) => s.itemId === 'potion_health')!.count).toBe(5); // empilhou
    expect(bag.items.find((s) => s.itemId === 'slime_gel')!.count).toBe(5);
    // pegar de volta (não divide com o grupo)
    w.ui.lootId = bag.id;
    sim.takeLoot('all');
    expect(inv.filter(Boolean)).toHaveLength(2);
    expect(bags()).toHaveLength(0);
  });

  it('o pegar-tudo automático não recolhe o que você mesmo jogou', () => {
    const sim = makeSim('knight', { seed: 3 });
    const w = sim.world;
    sim.setAuto({ autoLoot: true });
    w.player.character.inventory.fill(null);
    w.player.character.inventory[0] = { itemId: 'slime_gel', count: 4 };
    sim.drop(0);
    advance(sim, 2000, 50);
    expect([...w.lootBags.values()].some((b) => b.dropped)).toBe(true);
    expect(w.player.character.inventory[0]).toBeNull();
  });
});
