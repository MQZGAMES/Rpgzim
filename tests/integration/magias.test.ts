// Magias novas e ajustes: Corrida, Escudo de Mana, Grito de Guerra, Flecha Atordoante, lentidão em jogadores,
// retarget ao segurar o atalho, recargas de 2 s e flechas consumidas da mochila.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { chebyshev } from '../../src/domain/value-objects/position';
import { actorSource, damagePlayer } from '../../src/game/combat/combat';
import { canEnter } from '../../src/game/movement/movement';
import { isPz } from '../../src/game/world/GameMap';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { asActor } from '../../src/game/simulation/World';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

function field(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  const free = (x: number, y: number) => canEnter(w, x, y, false, 'x') && !isPz(w.map, x, y) && !w.map.city[y * w.map.width + x];
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
        if (ok && [...w.monsters.values()].filter((m) => m.alive).every((m) => chebyshev(m, { x, y }) > 12)) return { x, y };
      }
  throw new Error('sem campo aberto');
}

function put(sim: GameSimulation, a: { x: number; y: number; id: string }, x: number, y: number) {
  const w = sim.world;
  if (w.occupancy.get(a.y * w.map.width + a.x) === a.id) w.occupancy.delete(a.y * w.map.width + a.x);
  a.x = x;
  a.y = y;
  w.occupancy.set(y * w.map.width + x, a.id);
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
  it('é de todas as vocações, acelera 8 s e desfaz a lentidão', () => {
    for (const v of Object.values(GAME_DATA.vocations)) expect(v.spells).toContain('haste');
    const sim = makeSim('knight');
    clearMonsters(sim);
    levelUp(sim);
    const p = sim.world.player;
    const base = p.stats.speed;
    p.slowUntil = sim.world.now + 5000;
    p.slowFactor = 0.4;
    expect(sim.castSpell('haste')).toBe(true);
    expect(p.stats.speed).toBeGreaterThan(base + 1);
    expect(p.slowUntil).toBe(0); // a lentidão acabou
    advance(sim, 8200, 100);
    expect(p.stats.speed).toBeCloseTo(base, 5);
  });
});

describe('Rajada Glacial e lentidão em jogadores', () => {
  it('o raio voltou a ser 1 (o tamanho anterior)', () => {
    expect(GAME_DATA.spells.frost_burst?.radius).toBe(1);
    expect(GAME_DATA.spells.frost_burst?.cooldownMs).toBe(4500);
  });

  it('um jogador/herói atingido (PK ligado) toma o dano e fica lento', () => {
    const sim = makeSim('druid');
    clearMonsters(sim);
    levelUp(sim);
    const hero = GAME_DATA.heroes.boladex!;
    const h = sim.addHero(hero, createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: sim.world.map.playerStart }));
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
    expect(buildSnapshot(sim, 1).buffs.some((b) => b.kind === 'manaShield' && b.remainingMs > 290000)).toBe(true);
    p.invulnerableUntil = 0;
    p.character.mana = 100;
    const hits: { amount: number; manaLoss?: number }[] = [];
    sim.events.on('damage', (e) => e.targetId === p.id && hits.push({ amount: e.amount, manaLoss: e.manaLoss }));
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
  it('Grito de Guerra atrai as criaturas em 3 tiles', () => {
    const sim = makeSim('knight');
    clearMonsters(sim);
    levelUp(sim, 10, 0);
    const w = sim.world;
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 3, spot.y);
    m.state = 'idle';
    expect(GAME_DATA.spells.war_cry?.attract).toBe(true);
    expect(sim.castSpell('war_cry')).toBe(true);
    expect(m.targetId).toBe(w.player.id);
  });

  it('Flecha Atordoante deixa o alvo lento, gasta 1 flecha e a mais forte vai primeiro', () => {
    const sim = makeSim('paladin');
    clearMonsters(sim);
    levelUp(sim, 12, 0);
    const w = sim.world;
    const c = w.player.character;
    c.inventory.fill(null);
    c.inventory[0] = { itemId: 'arrow', count: 10 };
    c.inventory[1] = { itemId: 'arrow_metal', count: 3 };
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 4, spot.y);
    m.state = 'idle';
    sim.setTarget(m.id);
    expect(sim.castSpell('stunning_arrow')).toBe(true);
    expect(m.slowUntil).toBeGreaterThan(w.now);
    expect(countItem(c.inventory, 'arrow_metal')).toBe(2); // gastou a de metal primeiro
    expect(countItem(c.inventory, 'arrow')).toBe(10);
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
  it('Redemoinho de Aço e Flecha Sagrada têm 2 s de exaustão', () => {
    expect(GAME_DATA.spells.steel_whirlwind?.cooldownMs).toBe(2000);
    expect(GAME_DATA.spells.holy_arrow?.cooldownMs).toBe(2000);
  });

  it('não existe mais o slot de munição; o paladino gasta as flechas da mochila no ataque básico', () => {
    expect((GAME_DATA.vocations.paladin.startingEquipment as Record<string, unknown>).ammo).toBeUndefined();
    const sim = makeSim('paladin');
    clearMonsters(sim);
    const w = sim.world;
    const c = w.player.character;
    expect(countItem(c.inventory, 'arrow')).toBe(80);
    const spot = field(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const m = [...w.monsters.values()][0]!;
    m.alive = true;
    put(sim, m, spot.x + 4, spot.y);
    m.state = 'idle';
    m.def = { ...m.def, aggroRadius: 0 };
    sim.setStandAttack(true);
    sim.setTarget(m.id);
    advance(sim, 3000, 50);
    expect(countItem(c.inventory, 'arrow')).toBeLessThan(80);
    // o snapshot mostra as flechas disponíveis por tipo
    const ammo = buildSnapshot(sim, 1).ammo!;
    expect(ammo.total).toBe(countItem(c.inventory, 'arrow'));
    expect(ammo.types[0]!.name).toBe('Flecha de Pedra');
    // outras vocações não mostram contador
    expect(buildSnapshot(makeSim('knight'), 1).ammo).toBeNull();
  });

  it('o ataque soma o bônus da flecha (metal +2 > pedra +1)', () => {
    const run = (itemId: string) => {
      const sim = makeSim('paladin', { seed: 9 });
      clearMonsters(sim);
      const w = sim.world;
      const c = w.player.character;
      c.inventory.fill(null);
      c.inventory[0] = { itemId, count: 100 };
      const spot = field(sim);
      sim.teleportPlayer(spot.x, spot.y);
      const hero = GAME_DATA.heroes.boladex!;
      const h = sim.addHero(hero, createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart }));
      h.brain.nextThinkAt = Infinity;
      sim.setPvp(true);
      put(sim, h, spot.x + 4, spot.y);
      sim.setStandAttack(true);
      let total = 0;
      sim.events.on('damage', (e) => e.targetId === h.id && e.sourceId === w.human.id && (total += e.amount));
      sim.setTarget(h.id);
      for (let t = 0; t < 40000; t += 500) {
        h.character.health = h.stats.maxHealth;
        h.invulnerableUntil = 0;
        advance(sim, 500, 50);
      }
      return total;
    };
    expect(run('arrow_metal')).toBeGreaterThan(run('arrow'));
  });
});

describe('nomes dos atores no código', () => {
  it('actorSource aponta o atacante', () => {
    const sim = makeSim('knight');
    expect(actorSource(sim.world.human)).toMatchObject({ id: sim.world.human.id, kind: 'player' });
    void asActor;
  });
});
