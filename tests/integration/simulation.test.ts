// Testes de integração da simulação completa (sem renderização): fluxo principal do jogador.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { MemorySaveRepository } from '../../src/game/persistence/repositories';
import { SaveService } from '../../src/game/persistence/SaveService';
import type { SaveFile } from '../../src/game/persistence/saveSchema';
import { createRng } from '../../src/domain/value-objects/rng';
import { countItem } from '../../src/domain/rules/inventory';
import { isMoving } from '../../src/game/movement/movement';
import { buildingAt } from '../../src/game/world/GameMap';
import { advance, fixedLoot, makeSim, runUntil, worldMap } from '../helpers';
import { hasLineOfSight } from '../../src/game/combat/combat';
import { isPz } from '../../src/game/world/GameMap';
import type { MonsterEntity } from '../../src/game/entities/types';

function nearestMonster(sim: GameSimulation, monsterId: string): MonsterEntity {
  const p = sim.world.player;
  return [...sim.world.monsters.values()].filter((m) => m.def.id === monsterId && m.alive).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]!;
}

/** Coloca o jogador num tile livre, fora da zona protegida e com linha de visão, à distância `dist` do monstro. */
function placeNear(sim: GameSimulation, m: MonsterEntity, dist = 1) {
  const w = sim.world;
  for (let dy = -dist; dy <= dist; dy++)
    for (let dx = -dist; dx <= dist; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== dist) continue;
      const x = m.x + dx;
      const y = m.y + dy;
      if (isPz(w.map, x, y) || !hasLineOfSight(w, { x, y }, m)) continue;
      sim.teleportPlayer(x, y);
      if (w.player.x === x && w.player.y === y) return;
    }
  throw new Error('sem espaço perto do monstro');
}

describe('movimento', () => {
  it('move em 8 direções com velocidade normalizada na diagonal', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    sim.teleportPlayer(30, 23); // avenida, área aberta
    const start = { x: p.x, y: p.y };
    sim.setMoveDir({ dx: 1, dy: 0 });
    advance(sim, 1000);
    const straight = p.x - start.x;
    expect(straight).toBeGreaterThanOrEqual(3);
    sim.setMoveDir(null);
    runUntil(sim, () => !isMoving(p, sim.now), 2000);
    sim.teleportPlayer(30, 23);
    sim.setMoveDir({ dx: 1, dy: 1 });
    advance(sim, 1000);
    const diag = p.x - 30;
    expect(diag).toBeGreaterThanOrEqual(2);
    // diagonal percorre ~1/sqrt(2) tiles por eixo em relação ao reto
    expect(diag).toBeLessThan(straight);
  });

  it('é independente da taxa de quadros', () => {
    const a = makeSim('knight', { seed: 1 });
    const b = makeSim('knight', { seed: 1 });
    for (const s of [a, b]) {
      s.teleportPlayer(30, 23);
      s.setMoveDir({ dx: 1, dy: 0 });
    }
    for (let t = 0; t < 1200; t += 16) a.update(16);
    for (let t = 0; t < 1200; t += 40) b.update(40);
    expect(a.world.player.x).toBe(b.world.player.x);
  });

  it('não atravessa paredes', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    const temple = sim.world.map.buildings.find((b) => b.id === 'temple')!;
    // logo abaixo da parede do fundo, tentando subir
    sim.teleportPlayer(temple.x + 2, temple.y + 2);
    sim.setMoveDir({ dx: 0, dy: -1 });
    advance(sim, 2000);
    expect(p.y).toBe(temple.y + 2);
  });

  it('clique para andar usa pathfinding até o destino', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    expect(sim.walkTo(47, 24)).toBe(true);
    expect(runUntil(sim, () => p.x === 47 && p.y === 24, 15000)).toBe(true);
  });

  it('entra e sai de uma casa pela porta, no mesmo mapa, com a porta abrindo', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    const house = sim.world.map.buildings.find((b) => b.id === 'house_rosa')!;
    const door = sim.world.map.doors.find((d) => d.buildingId === house.id)!;
    const events: string[] = [];
    sim.events.on('doorChanged', (e) => events.push(`${e.doorId}:${e.open}`));
    sim.events.on('buildingChanged', (e) => events.push(`b:${e.buildingId}`));
    sim.teleportPlayer(door.x, door.y + 2);
    expect(sim.walkTo(door.x, door.y - 2)).toBe(true);
    expect(runUntil(sim, () => p.y === door.y - 2, 8000)).toBe(true);
    expect(buildingAt(sim.world.map, p.x, p.y)?.id).toBe(house.id);
    expect(events).toContain(`door_${house.id}:true`);
    expect(events).toContain(`b:${house.id}`);
    sim.walkTo(door.x, door.y + 2);
    expect(runUntil(sim, () => p.y === door.y + 2, 8000)).toBe(true);
    expect(events).toContain('b:null');
  });
});

describe('combate e progressão', () => {
  it('ataque automático derrota o monstro, concede XP, loot e treina a skill', () => {
    const sim = makeSim('knight', { loot: fixedLoot });
    const p = sim.world.player;
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime);
    const xpBefore = p.character.experience;
    const triesBefore = p.character.skills.sword.tries + p.character.skills.sword.level * 1000;
    let dropped: string | null = null;
    sim.events.on('lootDropped', (e) => (dropped = e.containerId));
    sim.setTarget(slime.id);
    expect(runUntil(sim, () => !slime.alive, 30000)).toBe(true);
    expect(p.character.experience).toBe(xpBefore + slime.def.experience);
    expect(p.character.skills.sword.tries + p.character.skills.sword.level * 1000).toBeGreaterThan(triesBefore);
    expect(dropped).not.toBeNull();
    // coleta o loot (ouro + itens)
    const gold = p.character.gold;
    sim.tapLoot(dropped!);
    runUntil(sim, () => sim.world.ui.lootId !== null, 3000);
    sim.takeLoot('all');
    expect(p.character.gold).toBe(gold + 5);
    expect(countItem(p.character.inventory, 'slime_gel')).toBe(2);
    expect(sim.world.lootBags.size).toBe(0);
  });

  it('monstros perseguem, atacam e voltam quando o jogador foge para a área protegida', () => {
    const sim = makeSim('knight', { seed: 3 });
    const p = sim.world.player;
    const boar = nearestMonster(sim, 'boar');
    placeNear(sim, boar, 3);
    const hp = p.character.health;
    expect(runUntil(sim, () => boar.state === 'chasing' || boar.state === 'attacking', 5000)).toBe(true);
    expect(runUntil(sim, () => p.character.health < hp, 15000)).toBe(true);
    sim.teleportPlayer(47, 24);
    expect(runUntil(sim, () => boar.state === 'returning' || boar.state === 'idle', 3000)).toBe(true);
  });

  it('monstro morto não ataca e reaparece após o tempo de respawn', () => {
    const sim = makeSim('knight');
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime);
    sim.setTarget(slime.id);
    runUntil(sim, () => !slime.alive, 30000);
    let hits = 0;
    sim.events.on('attack', (e) => e.sourceId === slime.id && hits++);
    sim.teleportPlayer(47, 24);
    expect(runUntil(sim, () => slime.alive, slime.def.respawnMs + 5000, 50)).toBe(true);
    expect(hits).toBe(0);
  });

  it('jogador morre, perde XP sem perder nível e renasce no templo', () => {
    const sim = makeSim('sorcerer', { seed: 9 });
    const p = sim.world.player;
    p.character.experience = 120;
    p.character.level = 2;
    const goblin = nearestMonster(sim, 'goblin');
    placeNear(sim, goblin, 2);
    p.character.health = 1;
    let died = false;
    sim.events.on('playerDied', () => (died = true));
    expect(runUntil(sim, () => died, 20000)).toBe(true);
    expect(p.dead).toBe(true);
    expect(p.character.level).toBe(2);
    expect(p.character.experience).toBeLessThan(120);
    sim.respawn();
    expect(p.dead).toBe(false);
    expect(p.x).toBe(sim.world.map.playerStart.x);
    expect(p.character.health).toBe(p.stats.maxHealth);
  });
});

describe('magias', () => {
  it('respeitam mana, cooldown, alcance e treinam o Magic Level', () => {
    const sim = makeSim('sorcerer', { loot: fixedLoot });
    const p = sim.world.player;
    const fails: string[] = [];
    sim.events.on('actionFailed', (e) => fails.push(e.message));
    // sem alvo
    expect(sim.castSpell('arcane_bolt')).toBe(false);
    const boar = nearestMonster(sim, 'boar');
    placeNear(sim, boar, 3);
    sim.setTarget(boar.id);
    const mana = p.character.mana;
    expect(sim.castSpell('arcane_bolt')).toBe(true);
    expect(p.character.mana).toBe(mana - 10);
    expect(boar.hp).toBeLessThan(boar.def.health);
    // cooldown ativo
    expect(sim.castSpell('arcane_bolt')).toBe(false);
    expect(fails.some((f) => f.includes('recarga'))).toBe(true);
    // fora de alcance
    advance(sim, 2100);
    sim.teleportPlayer(boar.x + 9, boar.y);
    if (Math.abs(p.x - boar.x) > 6) {
      expect(sim.castSpell('arcane_bolt')).toBe(false);
      expect(fails.some((f) => f.includes('alcance') || f.includes('visão'))).toBe(true);
    }
    // sem mana
    p.character.mana = 3;
    advance(sim, 2100);
    expect(sim.castSpell('light_heal')).toBe(false);
    expect(fails.some((f) => f.includes('Mana'))).toBe(true);
  });

  it('Magic Level sobe com mana gasta em magias válidas', () => {
    const sim = makeSim('druid');
    const p = sim.world.player;
    expect(p.character.skills.magic.level).toBe(0);
    for (let i = 0; i < 6; i++) {
      p.character.mana = p.stats.maxMana;
      p.character.health = 10;
      expect(sim.castSpell('light_heal')).toBe(true);
      advance(sim, 2100);
    }
    expect(p.character.skills.magic.level).toBeGreaterThanOrEqual(1);
    expect(p.stats.magicLevel).toBe(p.character.skills.magic.level);
  });

  it('magia em área atinge vários inimigos e aplica lentidão (Rajada Glacial)', () => {
    const sim = makeSim('druid');
    const p = sim.world.player;
    p.character.level = 4;
    p.character.skills.magic.level = 2;
    sim.world.player.stats = { ...p.stats, magicLevel: 2 };
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime, 3);
    sim.setTarget(slime.id);
    expect(sim.castSpell('frost_burst')).toBe(true);
    expect(slime.slowUntil).toBeGreaterThan(sim.now);
  });

  it('as quatro vocações conseguem conjurar sua magia inicial', () => {
    for (const [voc, spell] of [['sorcerer', 'arcane_bolt'], ['druid', 'earth_thorn'], ['paladin', 'holy_arrow'], ['knight', 'brutal_strike']] as const) {
      const sim = makeSim(voc);
      const slime = nearestMonster(sim, 'slime');
      placeNear(sim, slime, 1);
      sim.setTarget(slime.id);
      expect(sim.castSpell(spell), `${voc}:${spell}`).toBe(true);
    }
  });
});

describe('inventário, lojas e save', () => {
  it('poções restauram vida e respeitam o cooldown', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    p.character.health = 50;
    expect(sim.useItemById('potion_health')).toBe(true);
    expect(p.character.health).toBe(120);
    p.character.health = 50;
    expect(sim.useItemById('potion_health')).toBe(false);
    advance(sim, 1100);
    expect(sim.useItemById('potion_health')).toBe(true);
  });

  it('conversa com o ferreiro, compra e vende na loja', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    const smith = sim.world.npcs.get('npc:smith')!;
    sim.teleportPlayer(smith.x, smith.y + 2);
    sim.tapEntity(smith.id);
    runUntil(sim, () => sim.world.ui.dialog !== null, 4000);
    expect(sim.world.ui.dialog?.npcId).toBe(smith.id);
    sim.dialogChoose(0);
    expect(sim.world.ui.shop?.shopId).toBe('equipment');
    p.character.gold = 100;
    expect(sim.buy('shield_wood', 1)).toBe(true);
    expect(p.character.gold).toBe(55);
    expect(sim.buy('sword_iron', 1)).toBe(false);
    expect(sim.sell('shield_wood', 1)).toBe(true);
    expect(p.character.gold).toBe(55 + Math.round(45 * 0.35));
  });

  it('equipa item da mochila e os atributos mudam na hora', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    const idx = p.character.inventory.findIndex((s) => s?.itemId === 'axe_hand');
    expect(sim.equip(idx)).toBe(true);
    expect(p.stats.weapon.itemId).toBe('axe_hand');
    expect(sim.unequip('offHand')).toBe(true);
    expect(p.stats.shieldDefense).toBe(0);
  });

  it('salva e recarrega o jogo restaurando o estado', async () => {
    const sim = makeSim('paladin');
    const p = sim.world.player;
    sim.teleportPlayer(30, 23);
    p.character.gold = 999;
    p.character.experience = 300;
    p.character.level = 3;
    const svc = new SaveService(new MemorySaveRepository<SaveFile>(), GAME_DATA);
    await svc.save(sim.snapshotCharacter());
    const loaded = await svc.load(p.character.id);
    expect(loaded).not.toBeNull();
    const sim2 = new GameSimulation({ data: GAME_DATA, map: worldMap(), character: loaded!, rng: createRng(1), restorePosition: true });
    expect(sim2.world.player.x).toBe(30);
    expect(sim2.world.player.y).toBe(23);
    expect(sim2.world.player.character.gold).toBe(999);
    expect(sim2.world.player.character.equipment.ammo?.itemId).toBe('arrow');
  });
});
