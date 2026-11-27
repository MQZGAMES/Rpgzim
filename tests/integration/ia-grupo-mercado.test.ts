// Pacote de nov/2026: formação com 1 sqm de folga (ninguém trava o líder), pular a fila de personagens forçando o
// caminho, mochila de 35, trava de venda por unidade (equipamento) e por tipo (empilháveis), gestão do loot
// automático, materiais no mercado, revenda dos heróis (mercado → loja), estilo de jogo por sessão, vingança entre
// sessões e o filtro de nível para começar brigas.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { isSellLocked, sellAllPreview, unlockedCount } from '../../src/domain/rules/economy';
import { marketable } from '../../src/domain/rules/market';
import { categoryOf } from '../../src/domain/rules/marketCatalog';
import { chebyshev } from '../../src/domain/value-objects/position';
import { heroHelpers } from '../../src/game/ai/heroBrain';
import { rememberKill, rollSession, sessionWeights, worstKiller } from '../../src/game/ai/heroSession';
import { FORMATION_GAP, spreadStep } from '../../src/game/movement/follow';
import { FORCE_HOP_AFTER_MS, canEnter, resolveStuck } from '../../src/game/movement/movement';
import { cycleActorSelection } from '../../src/game/combat/combat';
import { acceptInvite, configureParty, invite } from '../../src/game/social/social';
import type { HeroEntity } from '../../src/game/entities/types';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { asActor, type World } from '../../src/game/simulation/World';
import { isPz } from '../../src/game/world/GameMap';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function addHero(sim: GameSimulation, heroId: string, level = 10): HeroEntity {
  const def = D.heroes[heroId]!;
  const c = createCharacter(D, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: sim.world.map.playerStart });
  c.level = level;
  return sim.addHero(def, c) as HeroEntity;
}

function putAt(w: World, a: { x: number; y: number; id: string }, x: number, y: number) {
  if (w.occupancy.get(a.y * w.map.width + a.x) === a.id) w.occupancy.delete(a.y * w.map.width + a.x);
  a.x = x;
  a.y = y;
  w.occupancy.set(y * w.map.width + x, a.id);
}

/** Linha reta livre (fora da vila) de `len` tiles a partir de um ponto. */
function openRow(w: World, len: number): { x: number; y: number } {
  const s = w.map.playerStart;
  const free = (x: number, y: number) =>
    canEnter(w, x, y, false, 'x') && !isPz(w.map, x, y) && !w.map.city[y * w.map.width + x];
  for (let r = 10; r < 90; r++)
    for (let dy = -r; dy <= r; dy++) {
      const x = s.x + r;
      const y = s.y + dy;
      let ok = true;
      for (let k = -2; k <= len && ok; k++) for (const yy of [y - 2, y - 1, y, y + 1, y + 2]) ok = free(x + k, yy);
      if (ok) return { x, y };
    }
  throw new Error('sem campo aberto');
}

function clearMonsters(w: World) {
  for (const m of w.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
}

describe('formação: 1 sqm de folga do líder e entre os membros', () => {
  it('o seguidor colado no líder abre um tile de folga (distância 2) e não fica na frente dele', () => {
    const sim = makeSim('knight', { seed: 3 });
    const w = sim.world;
    clearMonsters(w);
    const h = addHero(sim, 'boladex');
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    configureParty(w, w.human.id, { formation: 'follow' });
    const spot = openRow(w, 6);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(w, h, spot.x + 1, spot.y);
    expect(chebyshev(h, w.human)).toBe(1);
    advance(sim, 3000, 50);
    expect(chebyshev(h, w.human)).toBe(FORMATION_GAP);
  });

  it('dois seguidores não ficam colados um no outro', () => {
    const sim = makeSim('knight', { seed: 4 });
    const w = sim.world;
    clearMonsters(w);
    const a = addHero(sim, 'boladex');
    const b = addHero(sim, 'maguim');
    for (const h of [a, b]) {
      invite(w, w.human.id, h.id);
      acceptInvite(w, h.id, w.human.id);
    }
    configureParty(w, w.human.id, { formation: 'follow' });
    const spot = openRow(w, 6);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(w, a, spot.x + 2, spot.y);
    putAt(w, b, spot.x + 2, spot.y + 1);
    expect(chebyshev(a, b)).toBe(1);
    for (let i = 0; i < 6; i++) {
      asActor(w, b, () => spreadStep(w, b));
      advance(sim, 600, 50);
    }
    expect(chebyshev(a, b)).toBeGreaterThanOrEqual(2);
  });
});

describe('fila de personagens: quem força o caminho pula todos', () => {
  it('segurando o direcional, o jogador pula uma fileira dupla até o primeiro tile livre', () => {
    const sim = makeSim('knight', { seed: 5 });
    const w = sim.world;
    clearMonsters(w);
    const a = addHero(sim, 'boladex');
    const b = addHero(sim, 'maguim');
    a.brain.nextThinkAt = Infinity;
    b.brain.nextThinkAt = Infinity;
    const spot = openRow(w, 6);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(w, a, spot.x + 1, spot.y);
    putAt(w, b, spot.x + 2, spot.y);
    w.human.heldDir = { dx: 1, dy: 0 };
    // antes do tempo de insistência ninguém se mexe
    w.human.stuckWith = a.id;
    w.human.stuckSince = w.now - (FORCE_HOP_AFTER_MS - 50);
    w.human.stuckAt = w.now;
    resolveStuck(w, w.human, a.id);
    expect(w.human.x).toBe(spot.x);
    w.human.stuckSince = w.now - FORCE_HOP_AFTER_MS;
    w.human.stuckAt = w.now;
    resolveStuck(w, w.human, a.id);
    expect([w.human.x, w.human.y]).toEqual([spot.x + 3, spot.y]);
    // os dois continuam onde estavam (ninguém foi empurrado)
    expect([a.x, b.x]).toEqual([spot.x + 1, spot.x + 2]);
  });
});

describe('mochila e travas de venda', () => {
  it('a mochila tem 35 espaços', () => {
    const sim = makeSim('knight');
    expect(sim.world.player.character.inventory).toHaveLength(35);
  });

  it('equipamento: trava só aquela unidade; outra igual continua vendável', () => {
    const sim = makeSim('knight');
    const c = sim.world.player.character;
    c.inventory[10] = { itemId: 'helmet_steel', count: 1 };
    c.inventory[11] = { itemId: 'helmet_steel', count: 1 };
    sim.setSellLock('helmet_steel', true, { index: 10 });
    expect(c.inventory[10]!.locked).toBe(true);
    expect(c.inventory[11]!.locked).toBeUndefined();
    expect(unlockedCount(D, c, 'helmet_steel')).toBe(1);
    const shop = Object.values(D.shops).find((s) => s.buys.some((o) => o.itemId === 'helmet_steel'))!;
    expect(sellAllPreview(c, shop, D).find((r) => r.itemId === 'helmet_steel')?.count).toBe(1);
    // a trava vai junto ao organizar e sobrevive ao salvar/carregar
    sim.sortInventory('value', 'asc');
    expect(c.inventory.filter((s) => s?.itemId === 'helmet_steel' && s.locked)).toHaveLength(1);
    const back = parseSave(D, JSON.parse(JSON.stringify(toSaveFile(c)))).character;
    expect(back.inventory.filter((s) => s?.itemId === 'helmet_steel' && s.locked)).toHaveLength(1);
  });

  it('poção: trava pelo tipo (as que chegarem depois também) e não é mais automática', () => {
    const sim = makeSim('knight');
    const c = sim.world.player.character;
    // poção que ele nunca teve não vem travada
    expect(isSellLocked(c, 'potion_mana_great')).toBe(false);
    c.inventory[12] = { itemId: 'potion_mana_great', count: 3 };
    sim.setSellLock('potion_mana_great', true, { index: 12 });
    c.inventory[13] = { itemId: 'potion_mana_great', count: 100 };
    expect(unlockedCount(D, c, 'potion_mana_great')).toBe(0);
    sim.setSellLock('potion_mana_great', false, { index: 13 });
    expect(unlockedCount(D, c, 'potion_mana_great')).toBe(103);
  });

  it('as poções que o personagem já tinha entram travadas uma vez (ninguém perde poção no "vender tudo")', () => {
    const sim = makeSim('knight');
    const c = sim.world.player.character;
    expect(c.inventory.some((s) => s?.itemId === 'potion_health')).toBe(true);
    expect(isSellLocked(c, 'potion_health')).toBe(true);
  });
});

describe('loot automático: gestão nas configurações', () => {
  function bagAtFeet(sim: GameSimulation, items: { itemId: string; count: number }[], dropped = false) {
    const w = sim.world;
    w.lootBags.set('t1', { id: 't1', x: w.player.x, y: w.player.y, items, gold: 30, expiresAt: w.now + 60000, sourceName: 'Teste', ...(dropped ? { dropped: true } : {}) });
  }

  it('respeita as categorias, o valor mínimo e o ouro', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    clearMonsters(w);
    const c = w.player.character;
    const gold = c.gold;
    sim.setAuto({ autoLoot: true, lootGold: false, lootMaterials: false, lootGear: true, lootMinValue: 0 });
    bagAtFeet(sim, [
      { itemId: 'slime_gel', count: 3 },
      { itemId: 'helmet_steel', count: 1 },
    ]);
    advance(sim, 1000, 50);
    expect(countItem(c.inventory, 'helmet_steel')).toBe(1);
    expect(countItem(c.inventory, 'slime_gel')).toBe(0);
    expect(c.gold).toBe(gold);
  });

  it('o que você jogou no chão não volta sozinho', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    clearMonsters(w);
    const c = w.player.character;
    sim.setAuto({ autoLoot: true });
    c.inventory[20] = { itemId: 'helmet_steel', count: 1 };
    sim.drop(20);
    advance(sim, 1500, 50);
    expect(countItem(c.inventory, 'helmet_steel')).toBe(0);
  });
});

describe('mercado: materiais e revenda dos heróis', () => {
  it('materiais de criaturas entram no mercado, numa categoria própria', () => {
    expect(marketable(D.items.wolf_pelt)).toBe(true);
    expect(categoryOf(D.items.wolf_pelt)).toBe('material');
  });

  it('o herói compra o que está anunciado abaixo do que a loja paga e leva à loja na mesma visita', () => {
    const sim = makeSim('knight', { seed: 9 });
    const w = sim.world;
    const h = addHero(sim, 'boladex', 20);
    h.brain.nextThinkAt = Infinity;
    h.character.bankGold = 5000;
    const shop = Object.values(D.shops).find((s) => s.buys.some((o) => o.itemId === 'wolf_pelt'))!;
    const pays = shop.buys.find((o) => o.itemId === 'wolf_pelt')!.price;
    const cheap = Math.max(1, Math.floor(pays * 0.5));
    w.market.offers.push({ id: 'x1', side: 'sell', ownerId: 'alguem', ownerName: 'Alguém', itemId: 'wolf_pelt', count: 10, price: cheap, at: 0 });
    // um anúncio caro (sem lucro) fica onde está
    w.market.offers.push({ id: 'x2', side: 'sell', ownerId: 'alguem', ownerName: 'Alguém', itemId: 'bear_claw', count: 5, price: 99999, at: 0 });
    asActor(w, h, () => {
      w.ui.market = { npcId: 'npc:broker' };
      heroHelpers.marketing(w, h);
    });
    expect(countItem(h.character.inventory, 'wolf_pelt')).toBe(10);
    expect(w.market.offers.some((o) => o.id === 'x2')).toBe(true);
    expect(h.brain.town.some((st) => st.kind === 'shop')).toBe(true);
  });
});

describe('estilo de jogo por sessão e vingança', () => {
  it('cada sessão sorteia um estilo; PK é sempre minoria e só para quem tem coragem ou ganância', () => {
    const calm = { bravery: 0.3, greed: 0.3, discipline: 0.6, sociability: 0.6, caution: 0.7 };
    expect(sessionWeights(calm).pker).toBe(0);
    const bold = { bravery: 0.8, greed: 0.8, discipline: 0.4, sociability: 0.4, caution: 0.3 };
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const s = rollSession(bold, i / 1000, 0).style;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(5);
    expect(counts.pker ?? 0).toBeGreaterThan(0);
    expect(counts.pker ?? 0).toBeLessThan(150);
  });

  it('quem o matou continua na memória na próxima sessão (vira a rixa da vez)', () => {
    const sim = makeSim('knight', { seed: 11 });
    const w = sim.world;
    rememberKill(w, 'hero:boladex', w.human.id, 100);
    rememberKill(w, 'hero:boladex', w.human.id, 200);
    expect(worstKiller(w, 'hero:boladex')).toEqual({ id: w.human.id, count: 2 });
  });
});

describe('botão de seleção de personagens', () => {
  it('pula quem está no seu grupo', () => {
    const sim = makeSim('knight', { seed: 6 });
    const w = sim.world;
    clearMonsters(w);
    const mate = addHero(sim, 'boladex');
    const other = addHero(sim, 'maguim');
    mate.brain.nextThinkAt = Infinity;
    other.brain.nextThinkAt = Infinity;
    invite(w, w.human.id, mate.id);
    acceptInvite(w, mate.id, w.human.id);
    const spot = openRow(w, 6);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(w, mate, spot.x + 1, spot.y); // o colega está mais perto
    putAt(w, other, spot.x + 3, spot.y);
    cycleActorSelection(w);
    expect(w.ui.selectedActor).toBe(other.id);
    cycleActorSelection(w);
    expect(w.ui.selectedActor).toBeNull(); // depois do último, desmarca (o colega nunca entra)
  });
});