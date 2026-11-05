// Mercado como livro de ofertas: comprar pelo menor preço, vender pela maior oferta, ordens que cruzam fecham na hora
// pelo preço de quem esperava, ouro reservado nas ofertas de compra, entregas para quem está fora ou sem espaço.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import type { HeroEntity } from '../../src/game/entities/types';
import { heroHelpers } from '../../src/game/ai/heroBrain';
import { asActor, type World } from '../../src/game/simulation/World';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { makeSim } from '../helpers';

const D = GAME_DATA;

function setup() {
  const sim = makeSim('knight', { seed: 12 });
  const w = sim.world;
  const def = D.heroes.boladex!;
  const c = createCharacter(D, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
  const h = sim.addHero(def, c) as HeroEntity;
  h.brain.nextThinkAt = Infinity;
  const bank = [...w.npcs.values()].find((n) => n.def.dialog[0]?.options.some((o) => o.action === 'openDepot'))!;
  const open = (x: World) => (x.ui.depot = { npcId: bank.id });
  open(w);
  return { sim, w, h, asHero: (fn: () => void) => asActor(w, h, () => (open(w), fn())) };
}

/** Anúncio de venda de alguém fora do jogo. */
function ask(w: World, seller: string, itemId: string, count: number, price: number, at = 0) {
  w.market.listings.push({ id: `x${w.market.seq++}`, sellerId: seller, sellerName: seller, itemId, count, price, listedAt: at });
}

describe('mercado: livro de ofertas', () => {
  it('comprar agora paga o menor preço primeiro, atravessando vários anúncios; cada vendedor recebe o seu', () => {
    const { sim, w } = setup();
    const p = w.human.character;
    ask(w, 'caro', 'potion_health', 10, 60);
    ask(w, 'barato', 'potion_health', 3, 30);
    ask(w, 'medio', 'potion_health', 4, 35);
    p.gold = 1000;
    expect(sim.marketBuyNow('potion_health', 5)).toBe(true);
    expect(countItem(p.depot, 'potion_health')).toBe(5);
    expect(p.gold).toBe(1000 - (3 * 30 + 2 * 35));
    expect(w.market.proceeds).toEqual({ barato: 90, medio: 70 });
    expect(w.market.listings.find((l) => l.sellerId === 'medio')!.count).toBe(2);
  });

  it('vender agora recebe a maior oferta; o comprador (no jogo) recebe no depósito e o ouro dele já estava reservado', () => {
    const { sim, w, h, asHero } = setup();
    h.character.gold = 2000;
    asHero(() => expect(sim.marketBid('sword_iron', 1, 300)).toBe(true));
    asHero(() => expect(sim.marketBid('sword_iron', 1, 250)).toBe(true));
    expect(h.character.gold).toBe(2000 - 550); // reservado
    const p = w.human.character;
    p.inventory[0] = { itemId: 'sword_iron', count: 1 };
    const bank = p.bankGold;
    expect(sim.marketSellNow('sword_iron', 1)).toBe(true);
    expect(p.bankGold).toBe(bank + 300); // a maior oferta
    expect(countItem(h.character.depot, 'sword_iron')).toBe(1);
    expect(w.market.bids).toHaveLength(1);
    // cancelar a oferta que sobrou devolve o ouro ao banco
    const left = w.market.bids[0]!.id;
    const hb = h.character.bankGold;
    asHero(() => expect(sim.marketCancel(left)).toBe(true));
    expect(h.character.bankGold).toBe(hb + 250);
  });

  it('anúncio que alcança uma oferta vende na hora pelo preço da oferta; oferta que alcança um anúncio compra pelo anunciado', () => {
    const { sim, w, h, asHero } = setup();
    const p = w.human.character;
    h.character.gold = 5000;
    asHero(() => sim.marketBid('bone_fragment', 10, 12));
    p.inventory[0] = { itemId: 'bone_fragment', count: 15 };
    const bank = p.bankGold;
    expect(sim.marketSell('bone_fragment', 15, 8)).toBe(true); // pede 8, alguém paga 12
    expect(p.bankGold).toBe(bank + 10 * 12);
    const rest = w.market.listings.find((l) => l.sellerId === p.id)!;
    expect(rest).toMatchObject({ count: 5, price: 8 });
    // oferta de compra a 20 encontra o anúncio de 8: compra a 8
    const gold = h.character.gold;
    asHero(() => expect(sim.marketBid('bone_fragment', 3, 20)).toBe(true));
    expect(h.character.gold).toBe(gold - 3 * 8);
    expect(w.market.bids).toHaveLength(0);
  });

  it('comprador fora do jogo ou com o depósito cheio recebe depois (entrega a retirar no banco)', () => {
    const { sim, w, h, asHero } = setup();
    w.market.bids.push({ id: 'b1', buyerId: 'fora', buyerName: 'Fora', itemId: 'wolf_pelt', count: 2, price: 20, placedAt: 0 });
    w.human.character.inventory[0] = { itemId: 'wolf_pelt', count: 2 };
    expect(sim.marketSellNow('wolf_pelt', 2)).toBe(true);
    expect(w.market.parcels.fora).toEqual([{ itemId: 'wolf_pelt', count: 2 }]);
    // herói com o depósito cheio: a compra fica esperando; com espaço, retira
    h.character.gold = 500;
    h.character.depot = h.character.depot.map(() => ({ itemId: 'bone_fragment', count: 100 }));
    asHero(() => sim.marketBid('wolf_pelt', 1, 30));
    w.human.character.inventory[0] = { itemId: 'wolf_pelt', count: 1 };
    expect(sim.marketSellNow('wolf_pelt', 1)).toBe(true);
    expect(w.market.parcels[h.character.id]).toEqual([{ itemId: 'wolf_pelt', count: 1 }]);
    h.character.depot[0] = null;
    asHero(() => expect(sim.marketTakeParcels()).toBe(true));
    expect(countItem(h.character.depot, 'wolf_pelt')).toBe(1);
    expect(w.market.parcels[h.character.id]).toBeUndefined();
  });

  it('a tela mostra o livro sem as suas ordens: menor venda, maior compra e o que você tem', () => {
    const { sim, w } = setup();
    ask(w, 'a', 'sword_iron', 1, 200);
    ask(w, 'b', 'sword_iron', 2, 180);
    w.market.bids.push({ id: 'b9', buyerId: 'c', buyerName: 'C', itemId: 'sword_iron', count: 1, price: 150, placedAt: 0 });
    w.human.character.inventory[0] = { itemId: 'sword_iron', count: 1 };
    const m = buildSnapshot(sim, 1).market!;
    const it = m.items.find((x) => x.itemId === 'sword_iron')!;
    expect(it.asks).toEqual([{ price: 180, count: 2 }, { price: 200, count: 1 }]);
    expect(it.bids).toEqual([{ price: 150, count: 1 }]);
    expect(it.owned).toBe(1);
  });

  it('o herói compra a poção pelo menor preço (nunca acima da loja) antes de ir ao NPC', () => {
    const { w, h, asHero } = setup();
    ask(w, 'x', 'potion_health', 50, 39);
    ask(w, 'y', 'potion_health', 5, 25);
    ask(w, 'z', 'potion_health', 50, 80); // acima da loja: não compra
    h.character.gold = 5000;
    h.character.inventory = h.character.inventory.map(() => null);
    asHero(() => heroHelpers.useMarket(w, h));
    expect(countItem(h.character.inventory, 'potion_health') + countItem(h.character.depot, 'potion_health')).toBeGreaterThan(5);
    expect(w.market.listings.some((l) => l.sellerId === 'y')).toBe(false); // o mais barato saiu primeiro
    expect(w.market.listings.find((l) => l.sellerId === 'z')!.count).toBe(50);
  });
});

describe('poções', () => {
  it('todas as poções têm exaustão de 2 segundos', () => {
    for (const i of Object.values(D.items).filter((x) => x.type === 'potion')) expect(i.use!.cooldownMs, i.id).toBe(2000);
  });
});
