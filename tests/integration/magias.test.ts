// Magias novas e ajustes: Corrida, Escudo de Mana, Grito de Guerra, Flecha Atordoante, lentidão em jogadores,
// retarget ao segurar o atalho, recargas de 2 s e flechas consumidas da mochila.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { levelSpeedBonus } from '../../src/domain/rules/stats';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { chebyshev } from '../../src/domain/value-objects/position';
import { actorSource, damagePlayer, monsterSource } from '../../src/game/combat/combat';
import { canEnter } from '../../src/game/movement/movement';
import { isPz } from '../../src/game/world/GameMap';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { asActor } from '../../src/game/simulation/World';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

function field(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  const free = (x: number, y: number) =>
    canEnter(w, x, y, false, 'x') && !isPz(w.map, x, y) && !w.map.city[y * w.map.width + x];
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
        if (ok && [...w.monsters.values()].filter((m) => m.alive).every((m) => chebyshev(m, { x, y }) > 12))
          return { x, y };
      }
  throw new Error('sem campo aberto');
}

function put(sim: GameSimulation, a: { x: number; y: number; id: string }, x: number, y: number) {
  const w = sim.world;
  if (w.occupancy.get(a.y * w.map.width + a.x) === a.id) w.occupancy.delete(a.y * w.map.width + a.x);
  a.x = x;
  a.y = y;
  w.occupancy.set(y * w.map.width + x, a.id);
  // criatura levada para outro lugar: a "casa" dela passa a ser ali (senão passaria do limite de perseguição e voltaria)
  const m = a as { homeX?: number; homeY?: number };
  if (m.homeX !== undefined) {
    m.homeX = x;
    m.homeY = y;
  }
}

function clearMonsters(sim: GameSimulation) {
  for (const m of sim.world.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
}

function levelUp(sim: GameSimulation, level = 20, magic = 12) {
  const c = sim.world.player.character;
  c.level = level;
  c.skills.magic.level = magic;
  sim.world.player.stats = { ...sim.world.player.stats, magicLevel: magic, maxMana: 999 };
  c.mana = 999;
}

describe('Corrida', () => {
  it('é de todas as vocações, acelera 1 min e desfaz a lentidão', () => {
    for (const v of Object.values(GAME_DATA.vocations)) expect(v.spells).toContain('haste');
    const sim = makeSim('knight');
    clearMonsters(sim);
    levelUp(sim);
    const p = sim.world.player;
    const base = p.stats.speed;
    p.slowUntil = sim.world.now + 5000;
    p.slowFactor = 0.4;
    expect(sim.castSpell('haste')).toBe(true);
    expect(p.stats.speed).toBeGreaterThan(base + 0.5); // Corrida dá +0,7
    expect(p.slowUntil).toBe(0); // a lentidão acabou
    advance(sim, 60200, 100);
    expect(p.stats.speed).toBeCloseTo(
      GAME_DATA.vocations[p.character.vocation].baseSpeed + levelSpeedBonus(p.character.level),
      5,
    );
    void base;
  });
});

describe('Rajada Glacial e lentidão em jogadores', () => {
  it('magia de área: raio 2, recarga de 2 s e 35 de mana (-2 s, +1 sqm, o dobro de mana)', () => {
    expect(GAME_DATA.spells.frost_burst).toMatchObject({ radius: 2, cooldownMs: 2000, manaCost: 35 });
  });

  it('um jogador/herói atingido (PK ligado) toma o dano e fica lento', () => {
    const sim = makeSim('druid');
    clearMonsters(sim);
    levelUp(sim);
    const hero = GAME_DATA.heroes.boladex!;
    const h = sim.addHero(
      hero,
      createCharacter(GAME_DATA, {
        id: hero.slotId,
        name: hero.name,
        vocation: hero.vocation,
        now: 0,
        position: sim.world.map.playerStart,
      }),
    );
    h.brain.nextThinkAt = Infinity;
    sim.setPvp(true);
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    put(sim, h, spot.x + 3, spot.y);
    h.invulnerableUntil = 0;
    sim.setTarget(h.id);
    const hp = h.character.health;
    expect(sim.castSpell('frost_burst')).toBe(true);
    expect(h.character.health).toBeLessThan(hp);
    expect(h.slowUntil).toBeGreaterThan(sim.world.now);
    expect(h.slowFactor).toBeLessThan(1);
  });
});

describe('Escudo de Mana', () => {
  it('é do Sorcerer e do Druid; por 5 min o dano sai da mana (o que passar vai para a vida)', () => {
    expect(GAME_DATA.spells.mana_shield?.vocations).toEqual(['sorcerer', 'druid']);
    expect(GAME_DATA.spells.mana_shield?.buff?.durationMs).toBe(300000);
    const sim = makeSim('sorcerer');
    clearMonsters(sim);
    levelUp(sim);
    const w = sim.world;
    const p = w.player;
    expect(sim.castSpell('mana_shield')).toBe(true);
    expect(buildSnapshot(sim, 1).buffs.some((b) => b.kind === 'manaShield' && b.remainingMs > 290000)).toBe(
      true,
    );
    p.invulnerableUntil = 0;
    p.character.mana = 100;
    const hits: { amount: number; manaLoss?: number }[] = [];
    sim.events.on(
      'damage',
      (e) => e.targetId === p.id && hits.push({ amount: e.amount, manaLoss: e.manaLoss }),
    );
    const hp = p.character.health;
    damagePlayer(w, 60, 'fire', { id: 'mon:x', name: 'Troll', kind: 'monster' }, true);
    expect(p.character.health).toBe(hp); // tudo da mana
    expect(p.character.mana).toBe(40);
    damagePlayer(w, 100, 'fire', { id: 'mon:x', name: 'Troll', kind: 'monster' }, true);
    expect(p.character.mana).toBe(0);
    expect(p.character.health).toBe(hp - 60); // 40 da mana, 60 da vida
    // o texto de dano separa o que saiu da mana (azul) do que passou para a vida (vermelho)
    expect(hits[0]).toEqual({ amount: 0, manaLoss: 60 });
    expect(hits[1]).toEqual({ amount: 60, manaLoss: 40 });
    // depois dos 5 min o escudo acaba
    p.character.mana = 100;
    advance(sim, 301000, 250);
    p.character.mana = 100;
    p.invulnerableUntil = 0;
    damagePlayer(w, 30, 'fire', { id: 'mon:x', name: 'Troll', kind: 'monster' }, true);
    expect(p.character.mana).toBeGreaterThanOrEqual(100 - 0);
  });
});

describe('Knight e Paladin', () => {
  it('Grito de Guerra: raio 5, recarga de 2 s, atrai as criaturas; o Redemoinho de Aço não atrai', () => {
    expect(GAME_DATA.spells.war_cry).toMatchObject({ radius: 5, cooldownMs: 2000 });
    const sim = makeSim('knight');
    clearMonsters(sim);
    levelUp(sim, 10, 0);
    const w = sim.world;
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 5, spot.y);
    m.state = 'idle';
    expect(GAME_DATA.spells.war_cry?.attract).toBe(true);
    expect(sim.castSpell('war_cry')).toBe(true);
    expect(m.targetId).toBe(w.player.id);
    // o Redemoinho de Aço só causa dano: o monstro atingido não é puxado
    advance(sim, 2500, 100);
    const other = [...w.monsters.values()][1]!;
    other.alive = true;
    put(sim, other, spot.x + 1, spot.y + 1);
    other.state = 'idle';
    other.targetId = null;
    other.def = { ...other.def, aggroRadius: 0 };
    other.hp = 1e6;
    expect(sim.castSpell('steel_whirlwind')).toBe(true);
    expect(other.tauntUntil).toBe(0);
  });

  it('Flecha Atordoante deixa o alvo lento (sem gastar flechas)', () => {
    const sim = makeSim('paladin');
    clearMonsters(sim);
    levelUp(sim, 12, 0);
    const w = sim.world;
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 4, spot.y);
    m.state = 'idle';
    sim.setTarget(m.id);
    expect(sim.castSpell('stunning_arrow')).toBe(true);
    expect(m.slowUntil).toBeGreaterThan(w.now);
  });
});

describe('segurar o atalho: alvo morto ou fora da tela passa para o mais próximo', () => {
  it('sem alvo (morreu) escolhe o mais próximo; alvo fora da tela é trocado pelo mais perto', () => {
    const sim = makeSim('druid');
    clearMonsters(sim);
    levelUp(sim);
    const w = sim.world;
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const [far, near, dead] = [...w.monsters.values()];
    for (const m of [far!, near!, dead!]) {
      m.alive = true;
      m.state = 'idle';
      m.hp = 1e6; // aguenta as magias do teste
      m.def = { ...m.def, aggroRadius: 0 };
    }
    put(sim, far!, spot.x + 8, spot.y);
    put(sim, near!, spot.x + 4, spot.y);
    put(sim, dead!, spot.x + 2, spot.y + 2);
    // 1) o alvo morreu
    sim.setTarget(dead!.id);
    dead!.alive = false;
    expect(sim.castSpell('earth_thorn')).toBe(true);
    expect(w.player.targetId).toBe(near!.id);
    // 2) o alvo ficou fora da tela (>9 tiles): passa para o inimigo mais próximo
    advance(sim, 2500, 100);
    put(sim, far!, spot.x + 14, spot.y);
    w.player.targetId = far!.id;
    expect(sim.castSpell('earth_thorn')).toBe(true);
    expect(w.player.targetId).toBe(near!.id);
  });
});

describe('recargas e flechas', () => {
  it.each([
    ['arrow_rain', 2000],
    ['brutal_strike', 2000],
    ['stunning_arrow', 4000],
    ['divine_shot', 4000],
    ['crippling_blow', 4000],
    ['sacred_fire', 4000],
    ['hunters_focus', 8000],
    ['iron_roar', 8000],
    ['flame_lance', 4000],
    ['ice_shard', 4000],
    ['fire_nova', 6000],
  ] as const)('keeps the expected cooldown for %s', (spellId, cooldownMs) => {
    expect(GAME_DATA.spells[spellId]?.cooldownMs).toBe(cooldownMs);
  });

  it('Redemoinho de Aço e Flecha Sagrada têm 2 s de exaustão', () => {
    expect(GAME_DATA.spells.steel_whirlwind?.cooldownMs).toBe(2000);
    expect(GAME_DATA.spells.holy_arrow?.cooldownMs).toBe(2000);
  });

  it('o arco não usa munição: atira sem flechas e o snapshot não tem contador', () => {
    expect((GAME_DATA.vocations.paladin.startingEquipment as Record<string, unknown>).ammo).toBeUndefined();
    const sim = makeSim('paladin');
    clearMonsters(sim);
    const w = sim.world;
    const c = w.player.character;
    expect(countItem(c.inventory, 'arrow')).toBe(0);
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 4, spot.y);
    m.state = 'idle';
    m.def = { ...m.def, aggroRadius: 0 };
    sim.setStandAttack(true);
    sim.setTarget(m.id);
    const hp = m.hp;
    advance(sim, 3000, 50);
    expect(m.hp).toBeLessThan(hp); // acertou sem nenhuma flecha na mochila
  });

  it('o dano do arco vem do ataque da arma: arco melhor bate mais forte', () => {
    expect(GAME_DATA.items.bow_royal!.weapon!.attack).toBeGreaterThan(
      GAME_DATA.items.bow_hunting!.weapon!.attack,
    );
  });
  it('Corrida: dura 1 min e a exaustão é de só 2 s (dá para renovar sempre)', () => {
    const s = GAME_DATA.spells.haste!;
    expect(s.buff!.durationMs).toBe(60000);
    expect(s.cooldownMs).toBe(2000);
  });
});

describe('nomes dos atores no código', () => {
  it('actorSource aponta o atacante', () => {
    const sim = makeSim('knight');
    expect(actorSource(sim.world.human)).toMatchObject({ id: sim.world.human.id, kind: 'player' });
    void asActor;
  });
});

describe('Iron Roar reflection', () => {
  /** Arma de dano fixo (10): o ataque normal do Knight vale sempre 10, então o reflexo vale 5. */
  function fixedWeapon(p: { stats: { weapon: unknown } }) {
    p.stats.weapon = { ...(p.stats.weapon as object), training: true, damage: [10, 10] };
  }
  function setupReflectingKnight() {
    const sim = makeSim('knight');
    clearMonsters(sim);
    levelUp(sim);
    const w = sim.world;
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    expect(sim.castSpell('iron_roar')).toBe(true);
    fixedWeapon(w.player);
    return { sim, w, spot };
  }

  it('reflects 50% of the knight normal attack, whatever damage he received', () => {
    const { sim, w, spot } = setupReflectingKnight();
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 1, spot.y);
    m.hp = 1000;
    damagePlayer(w, 100, 'fire', monsterSource(m));
    expect(m.hp).toBe(995);
    damagePlayer(w, 8, 'fire', monsterSource(m));
    expect(m.hp).toBe(990);
  });

  it('the reflected damage ignores armor and resistances, and a kill gives experience', () => {
    const { sim, w, spot } = setupReflectingKnight();
    const p = w.player;
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 1, spot.y);
    (m as { def: object }).def = { ...m.def, armor: 999, resistances: { physical: 0.9 } };
    m.hp = 1000;
    damagePlayer(w, 50, 'physical', monsterSource(m));
    expect(m.hp).toBe(995);
    const xp = p.character.experience;
    m.hp = 5;
    damagePlayer(w, 50, 'physical', monsterSource(m));
    expect(m.alive).toBe(false);
    expect(p.character.experience).toBe(xp + m.def.experience);
  });

  it('does not reflect after the buff expires (2 minutes)', () => {
    const { w } = setupReflectingKnight();
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    m.hp = 1000;
    w.now += 120000;
    damagePlayer(w, 100, 'fire', monsterSource(m));
    expect(m.hp).toBe(1000);
  });

  it('lasts 2 minutes: still reflects at 119 s', () => {
    const { w } = setupReflectingKnight();
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    m.hp = 1000;
    w.now += 119000;
    damagePlayer(w, 100, 'fire', monsterSource(m));
    expect(m.hp).toBe(995);
  });

  it('in PvP the reflection ignores the attacker armor and the PvP reduction, and reflects once', () => {
    const { sim, w, spot } = setupReflectingKnight();
    const def = GAME_DATA.heroes.boladex!;
    const h = sim.addHero(def, createCharacter(GAME_DATA, {
      id: def.slotId, name: def.name, vocation: 'knight', now: 0, position: spot,
    }));
    put(sim, h, spot.x + 1, spot.y);
    w.social.pvp = true;
    asActor(w, h, () => {
      levelUp(sim);
      expect(sim.castSpell('iron_roar')).toBe(true);
    });
    fixedWeapon(h);
    h.stats.armor = 500;
    const heroHealth = h.character.health;
    damagePlayer(w, 100, 'fire', actorSource(h));
    expect(heroHealth - h.character.health).toBe(5);
  });
});
