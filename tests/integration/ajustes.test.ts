// Ajustes: trava de venda, escada de criaturas, paladino colado no alvo, magia de alvo do Knight,
// Bênção da Seiva em grupo e as regras do grupo (formação, alvo, treino entre membros).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { CREATURE_LADDER } from '../../src/data/monsters';
import { createCharacter } from '../../src/domain/rules/character';
import { isSellLocked, sellAllPreview, setSellLock } from '../../src/domain/rules/economy';
import { chebyshev } from '../../src/domain/value-objects/position';
import { canEnter } from '../../src/game/movement/movement';
import { canAttackActor, configureParty, hasSkull } from '../../src/game/social/social';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { isPz } from '../../src/game/world/GameMap';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim, runUntil } from '../helpers';

function withHero(vocation: 'knight' | 'paladin' | 'druid' | 'sorcerer' = 'knight', seed = 21) {
  const sim = makeSim(vocation, { seed });
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: sim.world.map.playerStart });
  const h = sim.addHero(hero, c);
  return { sim, h, w: sim.world };
}

function putAt(sim: GameSimulation, a: { x: number; y: number; id: string }, x: number, y: number) {
  const w = sim.world;
  if (w.occupancy.get(a.y * w.map.width + a.x) === a.id) w.occupancy.delete(a.y * w.map.width + a.x);
  a.x = x;
  a.y = y;
  w.occupancy.set(y * w.map.width + x, a.id);
}

/** Tile livre fora da área protegida, longe dos monstros (campo aberto ao sul da vila). */
function openField(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  const free = (xx: number, yy: number) => canEnter(w, xx, yy, false, 'x') && !isPz(w.map, xx, yy) && !w.map.city[yy * w.map.width + xx];
  const s0 = w.map.playerStart;
  for (let r = 4; r < 60; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s0.x + dx;
        const y = s0.y + dy;
        let ok = true;
        for (let k = -9; k <= 9 && ok; k++) ok = free(x + k, y);
        for (let k = -4; k <= 4 && ok; k++) ok = free(x, y + k);
        if (ok && [...w.monsters.values()].every((m) => chebyshev(m, { x, y }) > 10)) return { x, y };
      }
  throw new Error('sem campo aberto');
}

const party = (sim: GameSimulation, leaderId: string, ids: string[]) => {
  sim.world.social.party = { leaderId, members: ids, formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] };
};

describe('trava de venda', () => {
  it('item travado fica fora do "vender tudo" e aparece com cadeado', () => {
    const sim = makeSim('knight');
    const c = sim.world.player.character;
    c.inventory[5] = { itemId: 'slime_gel', count: 6 };
    const shop = GAME_DATA.shops.potions!;
    expect(sellAllPreview(c, shop).some((r) => r.itemId === 'slime_gel')).toBe(true);
    sim.setSellLock('slime_gel', true);
    expect(isSellLocked(c, 'slime_gel')).toBe(true);
    expect(sellAllPreview(c, shop).some((r) => r.itemId === 'slime_gel')).toBe(false);
    expect(buildSnapshot(sim, 1).inventory[5]?.locked).toBe(true);
    setSellLock(c, 'slime_gel', false);
    expect(sellAllPreview(c, shop).some((r) => r.itemId === 'slime_gel')).toBe(true);
  });
});

describe('escada de criaturas', () => {
  it('cada patamar tem o dobro de vida e ataque do anterior', () => {
    const tiers = new Map<number, { hp: number; atk: number }>();
    for (const r of CREATURE_LADDER) {
      const m = GAME_DATA.monsters[r.id]!;
      if (r.step !== 0) continue;
      tiers.set(r.tier, { hp: m.health, atk: (m.attack.min + m.attack.max) / 2 });
    }
    const list = [...tiers.entries()].sort((a, b) => a[0] - b[0]);
    expect(list.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < list.length; i++) {
      expect(list[i]![1].hp / list[i - 1]![1].hp).toBeCloseTo(2, 0);
      expect(list[i]![1].atk / list[i - 1]![1].atk).toBeCloseTo(2, 0);
    }
    expect(CREATURE_LADDER.length).toBeGreaterThanOrEqual(18);
  });

  it('todas as áreas de caça novas têm criaturas no mapa', () => {
    const sim = makeSim('knight');
    const ids = new Set([...sim.world.monsters.values()].map((m) => m.def.id));
    for (const r of CREATURE_LADDER) expect(ids.has(r.id), r.id).toBe(true);
  });
});

describe('vocações', () => {
  it('paladino colado no alvo erra mais e bate mais fraco do que a 2+ tiles', () => {
    const total = (dist: number) => {
      const { sim, h, w } = withHero('paladin', 7);
      sim.setPvp(true);
      const spot = openField(sim);
      sim.teleportPlayer(spot.x, spot.y);
      putAt(sim, h, spot.x + dist, spot.y);
      h.brain.nextThinkAt = Infinity; // boneco de treino parado
      sim.setStandAttack(true);
      w.human.character.equipment.ammo = { itemId: w.human.character.equipment.ammo!.itemId, count: 999 };
      let dmg = 0;
      sim.events.on('damage', (e) => e.targetId === h.id && e.sourceId === w.human.id && (dmg += e.amount));
      sim.setTarget(h.id);
      for (let t = 0; t < 60000; t += 500) {
        h.character.health = h.stats.maxHealth;
        advance(sim, 500, 50);
      }
      return dmg;
    };
    const near = total(1);
    const far = total(3);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeLessThan(far * 0.6);
  });

  it('Golpe Brutal do Knight sem alvo mira o inimigo mais próximo e sai ao chegar nele', () => {
    const sim = makeSim('knight', { seed: 3 });
    const w = sim.world;
    const slime = [...w.monsters.values()].filter((m) => m.def.id === 'slime').sort((a, b) => chebyshev(a, w.player) - chebyshev(b, w.player))[0]!;
    // 3 tiles do slime, fora da área protegida
    const spot = [...Array(49).keys()]
      .map((i) => ({ x: slime.x + (i % 7) - 3, y: slime.y + Math.floor(i / 7) - 3 }))
      .find((c) => chebyshev(c, slime) === 3 && canEnter(w, c.x, c.y, false, w.player.id) && !isPz(w.map, c.x, c.y))!;
    sim.teleportPlayer(spot.x, spot.y);
    slime.state = 'idle';
    w.player.character.mana = 999;
    let cast = false;
    sim.events.on('spellCast', (e) => e.spellId === 'brutal_strike' && (cast = true));
    sim.castSpell('brutal_strike');
    expect(w.player.targetId).toBe(slime.id);
    runUntil(sim, () => cast, 4000, 50);
    expect(cast).toBe(true);
  });

  it('Bênção da Seiva cura os membros do grupo por perto (raio médio), não quem está longe', () => {
    const { sim, h, w } = withHero('druid');
    const p = w.player;
    p.character.level = 6;
    p.character.skills.magic.level = 3;
    p.stats = { ...p.stats, magicLevel: 3 };
    p.character.mana = 999;
    party(sim, p.id, [p.id, h.id]);
    h.brain.nextThinkAt = Infinity;
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 3, spot.y);
    h.character.health = 10;
    expect(sim.castSpell('sap_blessing')).toBe(true);
    expect(h.character.health).toBeGreaterThan(10);
    expect(h.buffs.some((b) => b.kind === 'regen')).toBe(true);
    // longe (fora do raio): não cura
    advance(sim, 7000, 50);
    putAt(sim, h, spot.x + 4, spot.y + 4);
    putAt(sim, h, spot.x + 8, spot.y);
    h.character.health = 10;
    h.buffs = [];
    p.character.mana = 999;
    expect(sim.castSpell('sap_blessing')).toBe(true);
    expect(h.character.health).toBe(10);
  });
});

describe('controles do grupo', () => {
  it('só o líder muda as regras; treino entre membros libera o ataque sem PK e sem caveira', () => {
    const { sim, h, w } = withHero();
    party(sim, w.human.id, [w.human.id, h.id]);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    expect(canAttackActor(w, w.human, h)).toBe('party');
    expect(configureParty(w, h.id, { friendlyFire: true })).toBe('notLeader');
    sim.configureParty({ friendlyFire: true });
    expect(w.social.party!.friendlyFire).toBe(true);
    expect(w.social.pvp).toBe(false);
    expect(canAttackActor(w, w.human, h)).toBeNull();
    let hits = 0;
    sim.events.on('damage', (e) => e.targetId === h.id && e.sourceId === w.human.id && hits++);
    sim.setTarget(h.id);
    advance(sim, 3000, 50);
    expect(hits).toBeGreaterThan(0);
    expect(hasSkull(w, w.human.id)).toBe(false);
    // o herói entra no treino e revida
    runUntil(sim, () => h.targetId === w.human.id, 4000, 50);
    expect(h.targetId).toBe(w.human.id);
    // fora do grupo continua valendo o PK
    sim.disbandParty();
    expect(w.social.party).toBeNull();
    expect(canAttackActor(w, w.human, h)).toBe('off');
  });

  it('formação: o herói acompanha o jogador líder; em fila pisa nos passos dele', () => {
    const { sim, h, w } = withHero();
    party(sim, w.human.id, [w.human.id, h.id]);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    sim.configureParty({ formation: 'line' });
    // o líder anda 8 tiles para o lado
    sim.walkTo(spot.x - 8, spot.y);
    runUntil(sim, () => w.human.x === spot.x - 8, 8000, 50);
    advance(sim, 4000, 50);
    expect(w.social.party!.trail.length).toBeGreaterThan(4);
    expect(chebyshev(h, w.human)).toBeLessThanOrEqual(4);
  });

  it('com o herói de líder, o jogador sem alvo anda junto dele; formação livre não puxa', () => {
    const { sim, h, w } = withHero();
    party(sim, h.id, [h.id, w.human.id]);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 4, spot.y);
    h.brain.nextThinkAt = Infinity;
    advance(sim, 2000, 50);
    expect(chebyshev(h, w.human)).toBeLessThanOrEqual(3);
    // livre: ninguém puxa ninguém
    w.social.party!.formation = 'free';
    sim.teleportPlayer(spot.x - 4, spot.y);
    const before = { x: w.human.x, y: w.human.y };
    advance(sim, 2000, 50);
    expect({ x: w.human.x, y: w.human.y }).toEqual(before);
  });
});
