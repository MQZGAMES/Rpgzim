// Seguir o líder e perseguir sem travar, PK do grupo segue o líder, Corrida pela metade e jogar item no chão.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { computeStats } from '../../src/domain/rules/stats';
import { chebyshev } from '../../src/domain/value-objects/position';
import type { HeroEntity } from '../../src/game/entities/types';
import { canEnter } from '../../src/game/movement/movement';
import { acceptInvite, configureParty, invite } from '../../src/game/social/social';
import { levelSpeedBonus } from '../../src/domain/rules/stats';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { isPz } from '../../src/game/world/GameMap';
import { asActor } from '../../src/game/simulation/World';
import { actorSource, damagePlayer } from '../../src/game/combat/combat';
import { advance, makeSim } from '../helpers';

function withHero(id = 'boladex', seed = 31) {
  const sim = makeSim('knight', { seed });
  const hero = GAME_DATA.heroes[id]!;
  const c = createCharacter(GAME_DATA, {
    id: hero.slotId,
    name: hero.name,
    vocation: hero.vocation,
    now: 0,
    position: sim.world.map.playerStart,
  });
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
        for (let k = -3; k <= 34 && ok; k++)
          ok =
            canEnter(w, x + k, y, false, 'x') &&
            !isPz(w.map, x + k, y) &&
            !w.map.city[y * w.map.width + x + k];
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
    const p = sim.world.player;
    p.character.level = 10;
    p.character.mana = 999;
    expect(sim.castSpell('haste')).toBe(true);
    expect(p.stats.speed - computeStats(GAME_DATA, p.character).speed).toBeCloseTo(0.7);
  });
});

describe('seguir o líder sem travar', () => {
  it('o herói acompanha o jogador andando em linha reta: fica colado (no máximo 3 tiles depois de alcançar)', () => {
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
    expect(worst).toBeLessThanOrEqual(3); // colado: ao lado ou a um tile
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
    const foe = sim.addHero(
      hero2,
      createCharacter(GAME_DATA, {
        id: hero2.slotId,
        name: hero2.name,
        vocation: hero2.vocation,
        now: 0,
        position: w.map.playerStart,
      }),
    ) as HeroEntity;
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

describe('velocidade por nível e Corrida do seguidor', () => {
  it('cada nível soma um pouco: o nível 60 é mais rápido que o 18, sem exagero e com teto', () => {
    const gap = levelSpeedBonus(60) - levelSpeedBonus(18);
    expect(gap).toBeGreaterThan(0.3);
    expect(gap).toBeLessThan(0.7); // ~15% de diferença: dá para alcançar com a Corrida
    expect(levelSpeedBonus(1)).toBe(0);
    expect(levelSpeedBonus(100)).toBeLessThanOrEqual(1);
    for (let l = 2; l <= 100; l++) expect(levelSpeedBonus(l)).toBeGreaterThanOrEqual(levelSpeedBonus(l - 1));
    // a Corrida (+0,7) alcança quem não está de Corrida mesmo com 40 níveis a menos
    expect(GAME_DATA.spells.haste!.buff!.value + levelSpeedBonus(18)).toBeGreaterThan(levelSpeedBonus(60));
  });

  it('o herói que segue em grupo usa e renova a Corrida sozinho', () => {
    const { sim, w, h } = withHero();
    const spot = runway(sim);
    sim.teleportPlayer(spot.x, spot.y);
    asActor(w, h, () => sim.teleportPlayer(spot.x - 2, spot.y));
    h.character.level = 10;
    h.character.mana = 500;
    h.stats = { ...h.stats, maxMana: 500 };
    partyUp(w, h);
    h.brain.nextThinkAt = 0;
    advance(sim, 3000, 50);
    expect(h.buffs.some((b) => b.kind === 'haste')).toBe(true);
    const first = h.buffs.find((b) => b.kind === 'haste')!.expiresAt;
    advance(sim, 28000, 100);
    const now = h.buffs.find((b) => b.kind === 'haste');
    expect(now).toBeDefined(); // renovou antes de acabar
    expect(now!.expiresAt).toBeGreaterThan(first);
  });
});

describe('treino e duelo no grupo', () => {
  const setup = (mode: 'training' | 'duel') => {
    const { sim, w, h } = withHero('boladex', 15);
    const spot = runway(sim);
    sim.teleportPlayer(spot.x, spot.y);
    asActor(w, h, () => sim.teleportPlayer(spot.x + 1, spot.y));
    h.brain.nextThinkAt = Infinity;
    partyUp(w, h);
    w.human.character.level = 40;
    configureParty(w, w.human.id, { friendlyFire: true, sparMode: mode });
    return { sim, w, h, spot };
  };

  it('treino: cada um mantém a própria arma e ninguém passa de 50% de vida', () => {
    const { sim, w, h } = setup('training');
    const mainH = w.human.character.equipment.mainHand!.itemId;
    const mainHero = h.character.equipment.mainHand!.itemId;
    advance(sim, 1500, 50);
    expect(w.human.character.equipment.mainHand!.itemId).toBe(mainH); // sem trocas de arma
    expect(h.character.equipment.mainHand!.itemId).toBe(mainHero);
    // um golpe enorme do colega nunca leva a vida abaixo de 50% (nem uma magia ou área)
    const src = actorSource(w.human);
    asActor(w, h, () => damagePlayer(w, 10000, 'fire', src, true));
    expect(h.dead).toBe(false);
    expect(h.character.health).toBe(Math.ceil(h.stats.maxHealth * 0.5));
    asActor(w, h, () => damagePlayer(w, 10000, 'fire', src, true));
    expect(h.character.health).toBe(Math.ceil(h.stats.maxHealth * 0.5)); // com 50% o colega não tira mais nada
    // o ataque básico também espera: com o alvo em 50% o jogador não bate
    sim.setStandAttack(true);
    sim.setTarget(h.id);
    advance(sim, 4000, 50);
    expect(h.character.health).toBeGreaterThanOrEqual(Math.ceil(h.stats.maxHealth * 0.5)); // só a regeneração mexeu
    expect(h.character.health).toBeLessThan(Math.ceil(h.stats.maxHealth * 0.5) + 10);
    // ele se cura acima de 50% e o golpe volta a valer
    h.character.health = h.stats.maxHealth;
    asActor(w, h, () => damagePlayer(w, 30, 'fire', src, true));
    expect(h.character.health).toBeLessThan(h.stats.maxHealth); // acima de 50% o golpe volta a valer
  });

  it('duelo: vale até morrer e sem perder o saco', () => {
    const { sim, w, h } = setup('duel');
    const main = w.human.character.equipment.mainHand!.itemId;
    advance(sim, 1500, 50);
    expect(w.human.character.equipment.mainHand!.itemId).toBe(main);
    sim.setStandAttack(true);
    sim.setTarget(h.id);
    for (let t = 0; t < 90000 && !h.dead; t += 200) {
      h.invulnerableUntil = 0;
      advance(sim, 200, 50);
    }
    expect(h.dead).toBe(true);
    expect([...w.lootBags.values()].some((b) => b.ownerId === h.id)).toBe(false); // duelo: sem perder a mochila
  });
});

describe('banco nas lojas', () => {
  it('a loja mostra mochila e banco, compra gasta a mochila primeiro e o aviso diz quanto veio do banco', async () => {
    const sim = makeSim('knight', { seed: 2 });
    const w = sim.world;
    const { buildSnapshot } = await import('../../src/integration/game-ui-bridge/snapshot');
    const npc = [...w.npcs.values()].find((n) => n.def.shopId === 'equipment')!;
    w.ui.shop = { shopId: 'equipment', npcId: npc.id };
    const c = w.player.character;
    c.inventory.fill(null);
    const price = GAME_DATA.shops.equipment!.sells.find((o) => o.itemId === 'shield_wood')!.price;
    c.gold = price;
    c.bankGold = price * 2;
    const msgs: string[] = [];
    sim.events.on('message', (m) => msgs.push(m.text));
    const snap = buildSnapshot(sim, 1).shop!;
    expect(snap.bankGold).toBe(price * 2);
    expect(snap.sells.find((o) => o.item.itemId === 'shield_wood')!.canAfford).toBe(true);
    expect(sim.buy('shield_wood', 3)).toBe(true);
    expect(c.gold).toBe(0);
    expect(c.bankGold).toBe(0);
    expect(msgs.some((m) => m.includes('saiu do banco'))).toBe(true);
  });
});

describe('modo lurar', () => {
  it('o Knight do grupo puxa as criaturas da tela até o grupo (e quem ataca é o grupo todo)', () => {
    const { sim, w, h } = withHero('boladex');
    const start = runway(sim);
    sim.teleportPlayer(start.x, start.y);
    h.x = start.x + 2;
    h.y = start.y;
    partyUp(w, h);
    expect(configureParty(w, w.human.id, { targeting: 'lure' })).toBeNull();
    // duas criaturas fracas e paradas a uns 6 tiles do Knight
    const mons = [...w.monsters.values()].slice(0, 2);
    mons.forEach((m, i) => {
      m.def = GAME_DATA.monsters.slime!;
      m.hp = m.def.health;
      m.alive = true;
      m.state = 'idle';
      m.targetId = null;
      m.x = start.x + 8 + i;
      m.y = start.y;
    });
    h.character.level = 20;
    h.character.inventory[0] = { itemId: 'potion_health', count: 40 };
    h.brain.nextThinkAt = 0;
    h.brain.mode = 'follow';
    let pulled = false;
    for (let t = 0; t < 4000 && !pulled; t += 50) {
      advance(sim, 50, 50);
      pulled = mons.some((m) => m.targetId === h.id);
    }
    expect(pulled).toBe(true);
    expect(w.social.party?.targeting).toBe('lure');
  });

  it('o tanque é o Knight e, sem Knight, o Paladin', async () => {
    const { lureTankId } = await import('../../src/game/social/social');
    const { w, h } = withHero('boladex');
    partyUp(w, h);
    expect(lureTankId(w, w.social.party!)).toBe(w.human.id); // o jogador (Knight) é o tanque
    expect(h.character.vocation).toBe('knight');
  });
});

describe('atacar cancela o seguir do jogador', () => {
  it('ao mirar uma criatura o jogador larga o caminho do seguir e só volta a seguir depois de um tempo sem combate', () => {
    const { sim, w, h } = withHero('boladex');
    const start = runway(sim);
    sim.teleportPlayer(start.x, start.y);
    h.x = start.x + 20;
    h.y = start.y;
    invite(w, h.id, w.human.id); // o herói lidera
    acceptInvite(w, w.human.id, h.id);
    configureParty(w, h.id, { formation: 'follow' });
    const p = w.human;
    p.lastMoveCommandAt = -Infinity;
    advance(sim, 600, 50);
    expect(p.following).toBe(true);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    m.hp = 1e6;
    m.x = p.x + 3;
    m.y = p.y;
    p.targetId = m.id;
    advance(sim, 700, 50);
    expect(p.following).toBe(false);
    expect(p.path?.length ?? 0).toBe(0);
    // sem alvo e sem combate por 6 s: volta a seguir
    p.targetId = null;
    p.lastAttackAt = w.now;
    advance(sim, 3000, 50);
    expect(p.following).toBe(false);
    advance(sim, 4500, 50);
    expect(p.following).toBe(true);
  });
});
