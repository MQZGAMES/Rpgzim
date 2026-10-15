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
import { damagePlayer, hasLineOfSight, monsterSource } from '../../src/game/combat/combat';
import { refreshStats } from '../../src/game/progression/progression';
import { isPz } from '../../src/game/world/GameMap';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { createCharacter } from '../../src/domain/rules/character';
import { canEnter } from '../../src/game/movement/movement';
import { hasSkull, invite } from '../../src/game/social/social';
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
    // sem inimigos ao alcance (no templo), não há alvo automático
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

describe('ajustes de jogabilidade', () => {
  it('janela de loot mostra todos os sacos ao redor; o que sobra continua no respectivo saco', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    sim.teleportPlayer(80, 22);
    const p = w.player;
    const mk = (id: string, x: number, y: number, itemId: string, count: number, gold: number) =>
      w.lootBags.set(id, { id, x, y, items: [{ itemId, count }], gold, expiresAt: w.now + 60000, sourceName: 'Teste' });
    mk('b1', p.x, p.y, 'slime_gel', 2, 3);
    mk('b2', p.x + 1, p.y, 'boar_tusk', 1, 4);
    mk('b3', p.x, p.y + 1, 'meat', 1, 0);
    mk('longe', p.x + 4, p.y, 'goblin_ear', 1, 9);
    sim.tapLoot('b1');
    const snap = buildSnapshot(sim, 1);
    expect(snap.loot?.bags).toBe(3);
    expect(snap.loot?.gold).toBe(7);
    expect(snap.loot?.items.map((i) => i.item.itemId).sort()).toEqual(['boar_tusk', 'meat', 'slime_gel']);
    // pega só um item de um saco específico
    const tusk = snap.loot!.items.find((i) => i.item.itemId === 'boar_tusk')!;
    sim.takeLoot({ bagId: tusk.bagId, index: tusk.index });
    expect(countItem(p.character.inventory, 'boar_tusk')).toBe(1);
    expect(w.lootBags.get('b2')?.gold).toBe(4); // ouro do saco continua lá
    expect(w.lootBags.get('b1')?.items.length).toBe(1);
    // pegar tudo esvazia os sacos ao redor, mas não o distante
    const gold = p.character.gold;
    sim.takeLoot('all');
    expect(p.character.gold).toBe(gold + 7);
    expect([...w.lootBags.keys()]).toEqual(['longe']);
    expect(w.ui.lootId).toBeNull();
  });

  it('com a mochila cheia, o item que não cabe continua no seu saco', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    const p = w.player;
    sim.teleportPlayer(80, 22);
    p.character.inventory.fill({ itemId: 'dagger', count: 1 });
    w.lootBags.set('a', { id: 'a', x: p.x, y: p.y, items: [{ itemId: 'meat', count: 1 }], gold: 2, expiresAt: w.now + 60000, sourceName: 'A' });
    w.lootBags.set('b', { id: 'b', x: p.x + 1, y: p.y, items: [{ itemId: 'boar_hide', count: 1 }], gold: 0, expiresAt: w.now + 60000, sourceName: 'B' });
    sim.tapLoot('a');
    sim.takeLoot('all');
    expect(w.lootBags.get('a')?.items[0]?.itemId).toBe('meat');
    expect(w.lootBags.get('a')?.gold).toBe(0);
    expect(w.lootBags.get('b')?.items[0]?.itemId).toBe('boar_hide');
  });

  it('magia com alvo mira sozinha o inimigo mais próximo quando não há alvo', () => {
    const sim = makeSim('sorcerer');
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime, 3);
    expect(sim.world.player.targetId).toBeNull();
    expect(sim.castSpell('arcane_bolt')).toBe(true);
    expect(sim.world.player.targetId).not.toBeNull();
  });

  it('caminhar em frente a uma casa não atravessa a porta nem entra na construção', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    const house = w.map.buildings.find((b) => b.id === 'house_elder')!;
    const door = w.map.doors.find((d) => d.buildingId === house.id)!;
    sim.teleportPlayer(house.x - 1, door.y + 1);
    let entered = false;
    sim.events.on('buildingChanged', (e) => e.buildingId && (entered = true));
    expect(sim.walkTo(house.x + house.w, door.y + 1)).toBe(true);
    expect(w.player.path!.some((s) => s.x === door.x && (s.y === door.y || s.y === door.y - 1))).toBe(false);
    runUntil(sim, () => !w.player.path?.length && !w.player.move, 15000);
    expect(entered).toBe(false);
  });
});

describe('banco e melhorias de controle', () => {
  it('fala com a banqueira, guarda e retira item e ouro', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    const c = w.player.character;
    const banker = w.npcs.get('npc:banker')!;
    expect(banker).toBeTruthy();
    sim.teleportPlayer(banker.x, banker.y + 2);
    sim.tapEntity(banker.id);
    runUntil(sim, () => w.ui.dialog !== null, 4000);
    expect(sim.depotDeposit(0)).toBe(false); // depósito ainda fechado
    sim.dialogChoose(0);
    expect(w.ui.depot?.npcId).toBe(banker.id);
    const idx = c.inventory.findIndex((s) => s?.itemId === 'axe_hand');
    expect(sim.depotDeposit(idx)).toBe(true);
    expect(c.inventory[idx]).toBeNull();
    const d = c.depot.findIndex((s) => s?.itemId === 'axe_hand');
    expect(d).toBeGreaterThanOrEqual(0);
    expect(sim.bankGold('deposit', 30)).toBe(true);
    expect(c.bankGold).toBe(30);
    expect(sim.depotWithdraw(d)).toBe(true);
    expect(c.inventory.some((s) => s?.itemId === 'axe_hand')).toBe(true);
    // afastar-se fecha o banco
    sim.teleportPlayer(banker.x, banker.y + 5);
    advance(sim, 200);
    expect(w.ui.depot).toBeNull();
  });

  it('equipar avisa no registro de mensagens', () => {
    const sim = makeSim('knight');
    const msgs: string[] = [];
    sim.events.on('message', (m) => msgs.push(m.text));
    const idx = sim.world.player.character.inventory.findIndex((s) => s?.itemId === 'axe_hand');
    expect(sim.equip(idx)).toBe(true);
    expect(msgs).toContain('Equipado: Machadinha.');
  });

  it('clicar num tile bloqueado (meio do lago) caminha até a margem mais próxima', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    expect(sim.walkTo(13, 30)).toBe(true);
    const last = w.player.path![w.player.path!.length - 1]!;
    expect(Math.max(Math.abs(last.x - 13), Math.abs(last.y - 30))).toBeLessThanOrEqual(7);
  });

  it('o snapshot indica ataque/defesa e itens melhores na mochila', () => {
    const sim = makeSim('knight');
    const snap = buildSnapshot(sim, 1);
    const axe = snap.inventory.find((i) => i?.itemId === 'axe_hand')!;
    expect(axe.atk).toBe(12);
    expect(axe.better).toBe(true);
    expect(snap.equipment.offHand?.def).toBe(8);
  });
});

describe('Shielding e armas de treino', () => {
  /** Dois slimes batendo enquanto o jogador ataca: mede quanto o Shielding sobe em `ms`. */
  function shieldingAfter(voc: 'knight' | 'paladin' | 'sorcerer', ms: number, attack = true): { level: number; tries: number } {
    const sim = makeSim(voc, { seed: 7 });
    const w = sim.world;
    const p = w.player;
    // escudo de madeira na mão secundária e arma de treino (monstros vivem bastante)
    p.character.equipment.mainHand = { itemId: voc === 'sorcerer' ? 'training_wand' : voc === 'paladin' ? 'training_spear' : 'training_sword', count: 1 };
    p.character.equipment.offHand = { itemId: 'shield_wood', count: 1 };
    p.character.mana = 10_000;
    refreshStats(w);
    sim.update(16);
    const slimes = [...w.monsters.values()].filter((m) => m.def.id === 'slime').slice(0, 2);
    // simula sempre 2 atacantes: força os ataques chamando o dano diretamente a cada 2 s
    const atk = attack ? slimes[0]!.id : null;
    let t = 0;
    while (t < ms) {
      if (atk) {
        p.lastAttackAt = w.now;
      }
      for (const s of slimes) damagePlayer(w, 0, 'earth', monsterSource(s));
      p.character.health = 9999;
      advance(sim, 2000);
      t += 2000;
    }
    return p.character.skills.shielding;
  }

  it('treina com 2 monstros atacando mesmo com dano de terra; parado sem atacar não treina', () => {
    const k = shieldingAfter('knight', 120_000);
    expect(k.level).toBeGreaterThan(12);
    const idle = shieldingAfter('knight', 60_000, false);
    expect(idle).toEqual({ level: 10, tries: 0 });
  });

  it('Knight > Paladin > magos no mesmo tempo de treino', () => {
    const k = shieldingAfter('knight', 240_000);
    const p = shieldingAfter('paladin', 240_000);
    const m = shieldingAfter('sorcerer', 240_000);
    const score = (s: { level: number; tries: number }) => s.level * 1000 + s.tries;
    expect(score(k)).toBeGreaterThan(score(p));
    expect(score(p)).toBeGreaterThan(score(m));
  });

  it('arma de treino causa 1–2 de dano fixo (ignora armadura) e treina a skill', () => {
    const sim = makeSim('knight', { seed: 3 });
    const w = sim.world;
    const p = w.player;
    p.character.inventory[5] = { itemId: 'training_axe', count: 1 };
    expect(sim.equip(5)).toBe(true);
    const skel = nearestMonster(sim, 'skeleton'); // armadura 8: uma arma normal fraca seria absorvida
    placeNear(sim, skel, 1);
    const hits: number[] = [];
    sim.events.on('damage', (e) => e.targetId === skel.id && hits.push(e.amount));
    sim.setTarget(skel.id);
    const before = p.character.skills.axe.tries + p.character.skills.axe.level * 1000;
    for (let i = 0; i < 18; i++) {
      advance(sim, 500);
      p.character.health = p.stats.maxHealth; // o foco aqui é o dano causado, não a sobrevivência
    }
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.every((h) => h >= 1 && h <= 2)).toBe(true);
    expect(p.character.skills.axe.tries + p.character.skills.axe.level * 1000).toBeGreaterThan(before);
  });
});

describe('herói com vida própria (Boladex)', () => {
  function withBoladex(seed = 11) {
    const sim = makeSim('druid', { seed });
    const hero = GAME_DATA.heroes.boladex!;
    const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: sim.world.map.playerStart });
    const h = sim.addHero(hero, c);
    return { sim, h };
  }

  it('é um Knight com as mesmas regras do jogador: caça, sobe de nível, treina skills, vende, compra e guarda no banco', () => {
    const { sim, h } = withBoladex();
    const w = sim.world;
    const speech: string[] = [];
    const humanMessages: string[] = [];
    sim.events.on('speech', (e) => speech.push(e.text));
    sim.events.on('message', (m) => humanMessages.push(m.text));
    let sold = false;
    const start = { gold: h.character.gold, sword: h.character.skills.sword.level };
    for (let s = 0; s < 25 * 60; s++) {
      advance(sim, 1000, 50);
      w.human.character.health = w.human.stats.maxHealth;
      if (h.character.stats.monstersKilled > 0 && h.brain.mode === 'town') sold = true;
    }
    const c = h.character;
    expect(c.vocation).toBe('knight');
    expect(c.level).toBeGreaterThanOrEqual(6);
    expect(c.stats.monstersKilled).toBeGreaterThan(30);
    expect(c.skills.sword.level).toBeGreaterThan(start.sword);
    expect(c.skills.shielding.level).toBeGreaterThan(10);
    expect(sold).toBe(true);
    expect(c.bankGold).toBeGreaterThan(0);
    expect(potionsCount(c)).toBeGreaterThan(0);
    expect(speech.length).toBeGreaterThan(5);
    // as mensagens do herói não vão para o registro do jogador humano
    expect(humanMessages.some((m) => m.startsWith('Você derrotou'))).toBe(false);
  });

  it('monstros escolhem o herói como alvo e ele pode morrer e renascer no templo', () => {
    const { sim, h } = withBoladex(3);
    const w = sim.world;
    const skel = nearestMonster(sim, 'skeleton');
    // leva o herói nível 1 até as ruínas (perigoso) e trava a IA para ele não fugir
    sim.world.heroes.get(h.id)!.brain.nextThinkAt = Infinity;
    w.occupancy.delete(h.y * w.map.width + h.x);
    h.x = skel.x + 1;
    h.y = skel.y;
    w.occupancy.set(h.y * w.map.width + h.x, h.id);
    let died = false;
    sim.events.on('entityDied', (e) => e.entityId === h.id && (died = true));
    runUntil(sim, () => died, 120000, 50);
    expect(died).toBe(true);
    expect(skel.targetId === h.id || skel.targetId === null).toBe(true);
    // a IA volta a pensar: renasce no templo sozinho
    h.brain.nextThinkAt = 0;
    runUntil(sim, () => !h.dead, 15000, 50);
    expect(h.dead).toBe(false);
    expect(isPz(w.map, h.x, h.y)).toBe(true);
    expect(h.character.stats.deaths).toBe(1);
  });

  it('tocar no herói faz ele responder com o próprio status', () => {
    const { sim, h } = withBoladex();
    const said: string[] = [];
    sim.events.on('speech', (e) => e.entityId === h.id && said.push(e.text));
    sim.talkTo(h.id);
    expect(said[0]).toMatch(/Nível 1/);
  });
});

function potionsCount(c: { inventory: ({ itemId: string; count: number } | null)[] }) {
  return c.inventory.reduce((s, st) => s + (st && st.itemId.startsWith('potion_health') ? st.count : 0), 0);
}

describe('grupo, PK e modo de ataque', () => {
  function world(seed = 21) {
    const sim = makeSim('knight', { seed });
    const hero = GAME_DATA.heroes.boladex!;
    const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: sim.world.map.playerStart });
    const h = sim.addHero(hero, c);
    return { sim, h, w: sim.world };
  }
  const putAt = (sim: GameSimulation, a: { x: number; y: number; id: string }, x: number, y: number) => {
    const w = sim.world;
    w.occupancy.delete(a.y * w.map.width + a.x);
    a.x = x;
    a.y = y;
    w.occupancy.set(y * w.map.width + x, a.id);
  };

  it('convite: o herói pensa e aceita; quem convidou lidera; XP dividida igualmente entre quem está perto', () => {
    const { sim, h, w } = world();
    h.brain.affinity[w.human.id] = 0.8; // amigos
    expect(sim.partyInvite(h.id)).toBe(true);
    runUntil(sim, () => !!w.social.party, 10000, 50);
    expect(w.social.party?.leaderId).toBe(w.human.id);
    expect(w.social.party?.members.sort()).toEqual([h.id, w.human.id].sort());
    // XP: o humano mata um slime com o herói por perto -> cada um recebe metade
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime, 1);
    putAt(sim, h, w.human.x, w.human.y + 1 <= w.map.height ? w.human.y : w.human.y);
    h.brain.nextThinkAt = Infinity;
    const hx = [...Array(5).keys()].map((d) => ({ x: w.human.x + d - 2, y: w.human.y - 2 })).find((c) => canEnter(w, c.x, c.y, false, h.id))!;
    putAt(sim, h, hx.x, hx.y);
    const before = { human: w.human.character.experience, hero: h.character.experience };
    sim.setTarget(slime.id);
    runUntil(sim, () => !slime.alive, 30000, 50);
    const half = Math.floor(slime.def.experience / 2);
    expect(w.human.character.experience - before.human).toBe(half);
    expect(h.character.experience - before.hero).toBe(half);
    // passar liderança e sair
    sim.partyPassLeader(h.id);
    expect(w.social.party?.leaderId).toBe(h.id);
    sim.partyLeave();
    expect(w.social.party).toBeNull();
  });

  it('herói convida o jogador; aceitar forma o grupo com ele como líder', () => {
    const { sim, h, w } = world();
    invite(w, h.id, w.human.id);
    expect(buildSnapshot(sim, 1).invite?.fromName).toBe('Boladex');
    expect(sim.partyAccept()).toBe(true);
    expect(w.social.party?.leaderId).toBe(h.id);
  });

  it('modo "atacar parado" não persegue o alvo; "seguir" persegue', () => {
    const { sim, w } = world();
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime, 4);
    slime.state = 'idle';
    sim.setStandAttack(true);
    const start = { x: w.human.x, y: w.human.y };
    sim.setTarget(slime.id);
    advance(sim, 1500);
    expect({ x: w.human.x, y: w.human.y }).toEqual(start);
    sim.setStandAttack(false);
    advance(sim, 1500);
    expect(Math.max(Math.abs(w.human.x - start.x), Math.abs(w.human.y - start.y))).toBeGreaterThan(0);
  });

  it('PK: desligado ninguém ataca; ligado o jogador ataca o herói, ganha caveira e o herói revida', () => {
    const { sim, h, w } = world();
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime, 3); // fora da área protegida
    const spot = [...Array(9).keys()].map((i) => ({ x: w.human.x + (i % 3) - 1, y: w.human.y + Math.floor(i / 3) - 1 })).find((c) => (c.x !== w.human.x || c.y !== w.human.y) && canEnter(w, c.x, c.y, false, h.id) && !isPz(w.map, c.x, c.y))!;
    putAt(sim, h, spot.x, spot.y);
    h.brain.nextThinkAt = w.now + 2500; // o herói "demora" a reagir
    sim.setTarget(h.id);
    expect(w.human.targetId).toBeNull(); // PK desligado
    sim.setPvp(true);
    sim.setTarget(h.id);
    expect(w.human.targetId).toBe(h.id);
    let hits = 0;
    sim.events.on('damage', (e) => e.targetId === h.id && e.sourceId === w.human.id && hits++);
    advance(sim, 3000);
    expect(hits).toBeGreaterThan(0); // golpes do jogador no herói (armadura/escudo podem absorver)
    expect(hasSkull(w, w.human.id)).toBe(true);
    // o herói percebe o ataque e revida (ou foge se estiver perdendo)
    runUntil(sim, () => h.brain.mode === 'pk' || h.brain.mode === 'retreat', 5000, 50);
    expect(['pk', 'retreat']).toContain(h.brain.mode);
    if (h.brain.mode === 'pk') expect(h.targetId).toBe(w.human.id);
  });

  it('PK: sem nada a ganhar e sem motivo, o herói não ataca o jogador', () => {
    const { sim, h, w } = world(5);
    sim.setPvp(true);
    w.human.character.gold = 0;
    h.brain.affinity[w.human.id] = 0;
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime, 3);
    const spot = [...Array(25).keys()].map((i) => ({ x: w.human.x + (i % 5) - 2, y: w.human.y + Math.floor(i / 5) - 2 })).find((c) => (c.x !== w.human.x || c.y !== w.human.y) && canEnter(w, c.x, c.y, false, h.id) && !isPz(w.map, c.x, c.y))!;
    putAt(sim, h, spot.x, spot.y);
    h.character.level = 30;
    let attacked = false;
    sim.events.on('damage', (e) => e.targetId === w.human.id && e.sourceId === h.id && (attacked = true));
    for (let i = 0; i < 60; i++) {
      advance(sim, 1000, 50);
      w.human.character.health = w.human.stats.maxHealth;
    }
    expect(attacked).toBe(false);
  });

  it('PK: com ouro de sobra, jogador fraco e herói ganancioso, ele decide atacar', () => {
    const { sim, h, w } = world(9);
    sim.setPvp(true);
    w.human.character.gold = 5000;
    w.human.character.health = Math.floor(w.human.stats.maxHealth * 0.3);
    h.brain.affinity[w.human.id] = -0.5;
    h.character.level = 25;
    h.character.experience = 40000;
    sim.world.heroes.get(h.id)!.stats = { ...h.stats, maxHealth: 600, armor: 30 };
    h.character.health = 600;
    const slime = nearestMonster(sim, 'slime');
    placeNear(sim, slime, 3);
    const spot = [...Array(25).keys()].map((i) => ({ x: w.human.x + (i % 5) - 2, y: w.human.y + Math.floor(i / 5) - 2 })).find((c) => (c.x !== w.human.x || c.y !== w.human.y) && canEnter(w, c.x, c.y, false, h.id) && !isPz(w.map, c.x, c.y))!;
    putAt(sim, h, spot.x, spot.y);
    // caçando slimes ali mesmo (fora da área protegida, perto do jogador)
    h.brain.mode = 'hunt';
    h.brain.quarry = 'slime';
    h.brain.spot = { x: slime.x, y: slime.y };
    h.brain.modeUntil = w.now + 600000;
    runUntil(sim, () => (h.brain.mode as string) === 'pk', 90000, 50);
    expect(h.brain.pkTargetId).toBe(w.human.id);
  });
});
