// Ajustes: trava de venda, escada de criaturas, paladino colado no alvo, magia de alvo do Knight,
// Bênção da Seiva em grupo e as regras do grupo (formação, alvo, treino entre membros).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { countItem } from '../../src/domain/rules/inventory';
import { CREATURE_LADDER } from '../../src/data/monsters';
import { createCharacter } from '../../src/domain/rules/character';
import { isSellLocked, sellAllPreview, setSellLock } from '../../src/domain/rules/economy';
import { chebyshev } from '../../src/domain/value-objects/position';
import { canEnter, resolveStuck } from '../../src/game/movement/movement';
import { canAttackActor, configureParty, hasSkull } from '../../src/game/social/social';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { isPz } from '../../src/game/world/GameMap';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim, runUntil } from '../helpers';
import { asActor } from '../../src/game/simulation/World';
import { planWalk } from '../../src/game/movement/walk';

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

/** Remove os monstros vivos (o teste é de movimento, não de combate). */
const clearMonsters = (sim: GameSimulation) => {
  for (const m of sim.world.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
};

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
      // flechas de sobra na mochila (o paladino gasta as da mochila)
      for (let i = 10; i < 20; i++) w.human.character.inventory[i] = { itemId: 'arrow', count: 100 };
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

describe('controle no celular e ritmo', () => {
  it('andar por conta própria (toque no mapa) pausa a perseguição do alvo até escolher o alvo de novo', () => {
    const sim = makeSim('knight', { seed: 3 });
    const w = sim.world;
    const slime = [...w.monsters.values()].filter((m) => m.def.id === 'slime').sort((a, b) => chebyshev(a, w.player) - chebyshev(b, w.player))[0]!;
    const spot = [...Array(81).keys()]
      .map((i) => ({ x: slime.x + (i % 9) - 4, y: slime.y + Math.floor(i / 9) - 4 }))
      .find((c) => chebyshev(c, slime) === 4 && canEnter(w, c.x, c.y, false, w.player.id) && !isPz(w.map, c.x, c.y))!;
    sim.teleportPlayer(spot.x, spot.y);
    slime.state = 'idle';
    sim.setTarget(slime.id);
    // toca num tile 3 casas para longe do slime: o personagem vai até lá e fica (não volta para o alvo)
    const away = { x: spot.x + Math.sign(spot.x - slime.x || 1) * 3, y: spot.y };
    if (!sim.walkTo(away.x, away.y)) return; // terreno bloqueado nesta seed: nada a provar
    advance(sim, 4000, 50);
    expect(w.player.chasePaused).toBe(true);
    const parked = { x: w.player.x, y: w.player.y };
    advance(sim, 1500, 50);
    if (slime.state === 'idle') expect({ x: w.player.x, y: w.player.y }).toEqual(parked);
    // escolher o alvo de novo volta a perseguir
    sim.setTarget(slime.id);
    expect(w.player.chasePaused).toBe(false);
  });

  it('convite ao Boladex é respondido na hora', () => {
    const { sim, h, w } = withHero();
    expect(sim.partyInvite(h.id)).toBe(true);
    expect(w.social.party?.members).toContain(h.id);
  });

  it('ritmo de celular: jogador ~3 tiles/s e criaturas mais lentas que ele', () => {
    for (const v of Object.values(GAME_DATA.vocations)) {
      expect(v.baseSpeed).toBeGreaterThanOrEqual(2.8);
      expect(v.baseSpeed).toBeLessThanOrEqual(3.2);
    }
    for (const m of Object.values(GAME_DATA.monsters)) expect(m.speed).toBeLessThan(2.9);
  });

  it('atalhos: vincula item e poção, mostra no snapshot e usa pelo atalho', () => {
    const sim = makeSim('druid');
    const c = sim.world.player.character;
    c.inventory[6] = { itemId: 'meat', count: 2 };
    sim.setHotbar(0, { kind: 'item', id: 'meat' });
    const snap = buildSnapshot(sim, 1).hotbar;
    expect(snap).toHaveLength(8);
    expect(snap[0]).toMatchObject({ kind: 'item', itemId: 'meat', count: 2 });
    expect(snap.find((s) => s.kind === 'potion' && s.itemId === 'health')).toBeTruthy();
    // o atalho 1 foi trocado pela carne: ficam as outras 5 magias da barra
    expect(c.hotbar.filter((e) => e.startsWith('spell:')).length).toBe(GAME_DATA.vocations.druid.spells.slice(0, 6).length - 1);
    expect(sim.useItemById('meat')).toBe(true);
    expect(buildSnapshot(sim, 2).hotbar[0]!.count).toBe(1);
  });
});

describe('Boladex resolve a vila rápido', () => {
  it('a visita à vila tem limite de tempo e depois ele não volta tão cedo sem motivo urgente', () => {
    const { sim, h, w } = withHero();
    h.brain.town = [{ kind: 'shop', npcId: 'npc:inexistente', buyPotions: true, upgrades: false }, { kind: 'heal' }];
    h.brain.mode = 'town';
    h.brain.townStartedAt = w.now - 80000;
    h.brain.after = 'decide';
    runUntil(sim, () => h.brain.mode !== 'town', 5000, 50);
    expect(h.brain.mode).not.toBe('town');
    expect(h.brain.nextTownAt).toBeGreaterThan(w.now + 2 * 60000);
  });
});

describe('clique no mapa, mini mapa e lista de personagens', () => {
  it('tocar num tile bloqueado guarda um destino alcançável (o replanejamento não trava)', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    sim.teleportPlayer(30, 23);
    // procura um tile sólido (árvore, muro, água) perto
    let solid: { x: number; y: number } | null = null;
    for (let r = 2; r < 12 && !solid; r++)
      for (let dx = -r; dx <= r && !solid; dx++) if (w.map.solid[(23 + r) * w.map.width + 30 + dx]) solid = { x: 30 + dx, y: 23 + r };
    expect(solid).not.toBeNull();
    expect(sim.walkTo(solid!.x, solid!.y)).toBe(true);
    const goal = w.player.pathGoal!;
    expect(w.map.solid[goal.y * w.map.width + goal.x]).toBe(0);
    expect(canEnter(w, goal.x, goal.y, false, w.player.id)).toBe(true);
  });

  it('viagem pelo mini mapa atravessa o mundo até a área escolhida', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    const lair = w.map.regions.find((r) => r.id === 'canyon')!;
    expect(sim.travelTo(lair.x + Math.floor(lair.w / 2), lair.y + Math.floor(lair.h / 2))).toBe(true);
    const goal = w.player.pathGoal!;
    runUntil(
      sim,
      () => {
        w.player.character.health = w.player.stats.maxHealth; // o teste é do caminho, não do combate
        return chebyshev(w.player, goal) <= 1;
      },
      240000,
      50,
    );
    expect(chebyshev(w.player, goal)).toBeLessThanOrEqual(1);
  });

  it('chamado pela lista de online, o Boladex entra no grupo e vem até você mesmo de longe', () => {
    const { sim, h, w } = withHero();
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    expect(chebyshev(h, w.human)).toBeGreaterThan(15);
    expect(sim.partyInvite(h.id)).toBe(true);
    runUntil(sim, () => chebyshev(h, w.human) <= 4, 90000, 50);
    expect(chebyshev(h, w.human)).toBeLessThanOrEqual(4);
  });

  it('no grupo (mesmo com treino liberado) o Boladex nunca ataca nem desafia você por conta própria', () => {
    const { sim, h, w } = withHero();
    party(sim, w.human.id, [w.human.id, h.id]);
    w.social.party!.friendlyFire = true;
    sim.setPvp(true);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    let attacked = false;
    sim.events.on('damage', (e) => e.targetId === w.human.id && e.sourceId === h.id && (attacked = true));
    advance(sim, 5 * 60000, 100);
    expect(attacked).toBe(false);
  });

  it('o mercador compra flechas; "vender tudo" não vende a munição do arco equipado', () => {
    const shop = GAME_DATA.shops.general!;
    expect(shop.buys.some((o) => o.itemId === 'arrow')).toBe(true);
    const knight = makeSim('knight').world.player.character;
    knight.inventory[7] = { itemId: 'arrow', count: 20 };
    expect(sellAllPreview(knight, shop, GAME_DATA).some((r) => r.itemId === 'arrow')).toBe(true);
    const paladin = makeSim('paladin').world.player.character;
    paladin.inventory[7] = { itemId: 'arrow', count: 20 };
    expect(sellAllPreview(paladin, shop, GAME_DATA).some((r) => r.itemId === 'arrow')).toBe(false);
  });
});

describe('grupo: liderança livre e seguir fluido', () => {
  it('qualquer membro pode virar líder e você pode voltar a liderar (e mudar as regras sem ser o líder)', () => {
    const { sim, h, w } = withHero();
    expect(sim.partyInvite(h.id)).toBe(true);
    sim.partyPassLeader(h.id);
    expect(w.social.party!.leaderId).toBe(h.id);
    sim.configureParty({ formation: 'line' });
    expect(w.social.party!.formation).toBe('line');
    sim.partyPassLeader(w.human.id);
    expect(w.social.party!.leaderId).toBe(w.human.id);
  });

  it('você segue o Boladex líder de perto, sem parar e recomeçar', () => {
    const { sim, h, w } = withHero();
    clearMonsters(sim);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    party(sim, h.id, [h.id, w.human.id]);
    h.brain.nextThinkAt = Infinity; // o líder só anda o caminho dado
    expect(asActor(w, h, () => planWalk(w, spot.x - 9, spot.y))).toBe(true);
    let maxGap = 0;
    let stalls = 0;
    let last = { x: w.human.x, y: w.human.y };
    let lastMoveAt = w.now;
    let farSince: number | null = null;
    for (let t = 0; t < 8000; t += 50) {
      advance(sim, 50, 50);
      if (w.human.x !== last.x || w.human.y !== last.y) {
        last = { x: w.human.x, y: w.human.y };
        lastMoveAt = w.now;
      }
      maxGap = Math.max(maxGap, chebyshev(h, w.human));
      // líder andando, você longe dele e parado por mais de 0,8 s (contando de quando se afastou) = "travado"
      if (chebyshev(h, w.human) > 2) farSince ??= w.now;
      else farSince = null;
      if (h.path?.length && farSince !== null && w.now - Math.max(lastMoveAt, farSince) > 800) stalls++;
    }
    expect(maxGap).toBeLessThanOrEqual(4);
    expect(stalls).toBe(0);
    expect(chebyshev(h, w.human)).toBeLessThanOrEqual(2);
  });

  it('o Boladex segue você de perto e para ao seu lado', () => {
    const { sim, h, w } = withHero();
    clearMonsters(sim);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    party(sim, w.human.id, [w.human.id, h.id]);
    h.brain.mode = 'follow';
    expect(sim.walkTo(spot.x - 9, spot.y)).toBe(true);
    let maxGap = 0;
    for (let t = 0; t < 8000; t += 50) {
      advance(sim, 50, 50);
      maxGap = Math.max(maxGap, chebyshev(h, w.human));
    }
    expect(maxGap).toBeLessThanOrEqual(5);
    expect(chebyshev(h, w.human)).toBeLessThanOrEqual(2);
  });

  it('membros do grupo não se sobrepõem fora da cidade (e a insistência troca os lugares)', () => {
    const { sim, h, w } = withHero();
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    // ninguém entra no tile de outro personagem (fora da cidade)
    expect(canEnter(w, spot.x + 1, spot.y, false, w.human.id)).toBe(false);
    party(sim, w.human.id, [w.human.id, h.id]);
    expect(canEnter(w, spot.x + 1, spot.y, false, w.human.id)).toBe(false);
    // insistindo por mais de 5 s, os dois trocam de lugar em vez de ficar travados
    const before = { x: w.human.x, y: w.human.y };
    const heroBefore = { x: h.x, y: h.y };
    w.human.stuckSince = w.now - 6000;
    w.human.stuckAt = w.now;
    w.human.stuckWith = h.id;
    resolveStuck(w, w.human, h.id);
    expect([w.human.x, w.human.y]).toEqual([heroBefore.x, heroBefore.y]);
    expect([h.x, h.y]).toEqual([before.x, before.y]);
  });
});

describe('mini mapa: toque em lugar sem acesso', () => {
  it('tocar no meio de um lago leva até a margem mais próxima (não falha)', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    sim.teleportPlayer(30, 23);
    // centro de um lago: tile de água cercado de água
    let lake: { x: number; y: number } | null = null;
    for (let i = 0; i < w.map.width * w.map.height && !lake; i++) {
      const x = i % w.map.width;
      const y = Math.floor(i / w.map.width);
      let all = true;
      for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2 && all; dx++) all = (w.map.layers.water[(y + dy) * w.map.width + x + dx] ?? -1) >= 0;
      if (all) lake = { x, y };
    }
    expect(lake).not.toBeNull();
    expect(sim.travelTo(lake!.x, lake!.y)).toBe(true);
    const goal = w.player.pathGoal!;
    expect(chebyshev(goal, lake!)).toBeLessThanOrEqual(6);
  });
});

describe('loot do chão no grupo', () => {
  it('o ouro e os itens do chão são divididos igualmente; o resto (ímpar) fica com quem pegou', () => {
    const { sim, h, w } = withHero();
    party(sim, w.human.id, [w.human.id, h.id]);
    // saco com 7 de ouro e 5 gelatinas: 2 pessoas -> cada um leva 3 de ouro e 2 gelatinas; o resto vai para o humano
    w.lootBags.set('test-bag', { id: 'test-bag', x: w.human.x, y: w.human.y, gold: 7, items: [{ itemId: 'slime_gel', count: 5 }], sourceName: 'Teste', expiresAt: Infinity });
    w.ui.lootId = 'test-bag';
    const gold = { human: w.human.character.gold, hero: h.character.gold };
    const gel = { human: countItem(w.human.character.inventory, 'slime_gel'), hero: countItem(h.character.inventory, 'slime_gel') };
    sim.takeLoot('all');
    expect(w.human.character.gold - gold.human).toBe(4);
    expect(h.character.gold - gold.hero).toBe(3);
    expect(countItem(w.human.character.inventory, 'slime_gel') - gel.human).toBe(3);
    expect(countItem(h.character.inventory, 'slime_gel') - gel.hero).toBe(2);
    expect(w.lootBags.has('test-bag')).toBe(false);
  });
});
