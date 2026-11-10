// Mercado de Pedraluz (corretor ao lado da banqueira): só equipamentos e poções, livro de ofertas sem limite, comprar
// pelo menor preço, vender pela maior oferta, ofertas que cruzam fecham pelo preço de quem esperava, histórico e preço de
// referência, catálogo por categoria com comparação, persistência (inclusive do formato antigo) e os heróis negociando.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { escrowOf, marketable, offersFor, parseMarket, priceGuide } from '../../src/domain/rules/market';
import { SEASON } from '../../src/domain/rules/season';
import { buildCatalog, categoryOf, compareItem } from '../../src/domain/rules/marketCatalog';
import { chebyshev } from '../../src/domain/value-objects/position';
import type { HeroEntity } from '../../src/game/entities/types';
import { heroHelpers } from '../../src/game/ai/heroBrain';
import { asActor, type World } from '../../src/game/simulation/World';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;
const BROKER = 'npc:broker';

function setup(level = 10, heroId = 'boladex') {
  const sim = makeSim('knight', { seed: 12 });
  const w = sim.world;
  const def = D.heroes[heroId]!;
  const c = createCharacter(D, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
  c.level = level;
  const h = sim.addHero(def, c) as HeroEntity;
  h.brain.nextThinkAt = Infinity;
  const open = (x: World) => (x.ui.market = { npcId: BROKER });
  open(w);
  return { sim, w, h, asHero: (fn: () => void) => asActor(w, h, () => (open(w), fn())) };
}

/** Oferta de alguém fora do jogo. */
function offer(w: World, side: 'sell' | 'buy', owner: string, itemId: string, count: number, price: number, at = 0) {
  w.market.offers.push({ id: `x${++w.market.seq}`, side, ownerId: owner, ownerName: owner, itemId, count, price, at });
}

describe('mercado: o corretor e o que ele negocia', () => {
  it('o corretor fica ao lado da banqueira e abre o mercado (separado do depósito)', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    const broker = w.npcs.get(BROKER)!;
    const banker = w.npcs.get('npc:banker')!;
    expect(broker).toBeDefined();
    expect(chebyshev(broker, banker)).toBeLessThanOrEqual(4);
    sim.teleportPlayer(broker.x, broker.y + 2);
    sim.interact();
    if (w.ui.dialog?.npcId !== BROKER) sim.tapEntity(BROKER);
    const idx = broker.def.dialog[0]!.options.findIndex((o) => o.action === 'openMarket');
    sim.dialogChoose(idx);
    expect(w.ui.market?.npcId).toBe(BROKER);
    const snap = buildSnapshot(sim, 1);
    expect(snap.market).not.toBeNull();
    expect(snap.depot).toBeNull();
    // se afasta: a janela fecha
    sim.teleportPlayer(broker.x, broker.y + 9);
    advance(sim, 200, 50);
    expect(w.ui.market).toBeNull();
  });

  it('só equipamentos e poções: materiais de criaturas ficam para as lojas', () => {
    const { sim, w } = setup();
    expect(marketable(D.items.sword_iron)).toBe(true);
    expect(marketable(D.items.potion_health)).toBe(true);
    expect(marketable(D.items.bone_fragment)).toBe(false);
    expect(marketable(D.items.meat)).toBe(false);
    w.human.character.inventory[0] = { itemId: 'bone_fragment', count: 10 };
    expect(sim.marketOffer('sell', 'bone_fragment', 10, 5)).toBe(false);
    expect(countItem(w.human.character.inventory, 'bone_fragment')).toBe(10);
  });

  it('sem limite de ofertas por personagem', () => {
    const { sim, w } = setup();
    w.human.character.gold = 100000;
    for (let i = 0; i < 30; i++) expect(sim.marketOffer('buy', 'potion_health', 1, 10 + i)).toBe(true);
    expect(w.market.offers.filter((o) => o.ownerId === w.human.character.id)).toHaveLength(30);
  });
});

describe('mercado: livro de ofertas', () => {
  it('comprar agora paga o menor preço (várias unidades do mesmo preço de uma vez), recebe na mochila e entra no histórico', () => {
    const { sim, w } = setup();
    const p = w.human.character;
    offer(w, 'sell', 'caro', 'potion_health', 10, 60);
    offer(w, 'sell', 'barato', 'potion_health', 3, 30);
    offer(w, 'sell', 'barato2', 'potion_health', 4, 30);
    p.gold = 1000;
    p.inventory = p.inventory.map(() => null);
    // só no preço de 30 (mesmo que peça 9, para no que há a esse preço)
    expect(sim.marketBuyNow('potion_health', 9, 30)).toBe(true);
    expect(countItem(p.inventory, 'potion_health')).toBe(7);
    expect(p.gold).toBe(1000 - 7 * 30);
    expect(w.market.proceeds).toEqual({ barato: 90, barato2: 120 });
    expect(priceGuide(D, w.market, 'potion_health').last).toBe(30);
    expect(offersFor(w.market, 'potion_health', 'sell')).toHaveLength(1);
  });

  it('vender agora recebe a maior oferta; quem ofertou (no jogo) recebe no depósito; fora do jogo, ao logar', () => {
    const { sim, w, h, asHero } = setup();
    h.character.gold = 2000;
    asHero(() => expect(sim.marketOffer('buy', 'sword_iron', 1, 300)).toBe(true));
    offer(w, 'buy', 'fora', 'sword_iron', 1, 250);
    expect(escrowOf(w.market, h.character.id)).toBe(300);
    const p = w.human.character;
    p.inventory[0] = { itemId: 'sword_iron', count: 2 };
    const bank = p.bankGold;
    expect(sim.marketSellNow('sword_iron', 2)).toBe(true);
    expect(p.bankGold).toBe(bank + 300 + 250);
    expect(countItem(h.character.depot, 'sword_iron')).toBe(1);
    expect(w.market.parcels.fora).toEqual([{ itemId: 'sword_iron', count: 1 }]);
    // "fora" entra no jogo: a compra chega no depósito
    const def = D.heroes.maguim!;
    const c = createCharacter(D, { id: 'fora', name: 'Fora', vocation: 'knight', now: 0, position: w.map.playerStart });
    sim.addHero({ ...def, id: 'fora', slotId: 'fora', name: 'Fora', vocation: 'knight' }, c);
    expect(countItem(c.depot, 'sword_iron')).toBe(1);
    expect(w.market.parcels.fora).toBeUndefined();
  });

  it('anúncio que alcança uma oferta vende na hora pelo preço da oferta; oferta que alcança um anúncio compra pelo anunciado', () => {
    const { sim, w, h, asHero } = setup();
    const p = w.human.character;
    h.character.gold = 5000;
    asHero(() => sim.marketOffer('buy', 'potion_mana', 10, 40));
    p.inventory[0] = { itemId: 'potion_mana', count: 15 };
    const bank = p.bankGold;
    expect(sim.marketOffer('sell', 'potion_mana', 15, 30)).toBe(true); // pede 30, alguém paga 40
    expect(p.bankGold).toBe(bank + 10 * 40);
    expect(w.market.offers.find((o) => o.ownerId === p.id)).toMatchObject({ side: 'sell', count: 5, price: 30 });
    const gold = h.character.gold;
    asHero(() => expect(sim.marketOffer('buy', 'potion_mana', 3, 44)).toBe(true)); // oferta 44, há anúncio a 30
    expect(h.character.gold).toBe(gold - 3 * 30);
    expect(w.market.offers.filter((o) => o.side === 'buy')).toHaveLength(0);
  });

  it('cancelar: o anúncio devolve o item para a mochila; a oferta de compra devolve o ouro ao banco', () => {
    const { sim, w } = setup();
    const p = w.human.character;
    p.inventory[0] = { itemId: 'sword_iron', count: 1 };
    p.gold = 1000;
    sim.marketOffer('sell', 'sword_iron', 1, 250);
    sim.marketOffer('buy', 'helmet_iron', 2, 100);
    const bank = p.bankGold;
    for (const o of [...w.market.offers]) expect(sim.marketCancel(o.id)).toBe(true);
    expect(countItem(p.inventory, 'sword_iron')).toBe(1);
    expect(p.bankGold).toBe(bank + 200);
  });

  it('vender tudo rápido: anuncia tudo (mochila + depósito) um abaixo do menor anúncio ou, sem anúncio, pelo sugerido', () => {
    const { sim, w } = setup();
    const p = w.human.character;
    p.inventory = p.inventory.map(() => null);
    p.inventory[0] = { itemId: 'sword_iron', count: 1 };
    p.inventory[1] = { itemId: 'potion_health', count: 5 };
    p.inventory[2] = { itemId: 'bone_fragment', count: 4 }; // não é do mercado: fica
    p.depot[0] = { itemId: 'potion_health', count: 3 };
    offer(w, 'sell', 'a', 'sword_iron', 2, 260); // já anunciaram: um abaixo
    offer(w, 'buy', 'b', 'sword_iron', 1, 200); // não vende para a oferta de compra: anuncia acima dela
    const suggested = priceGuide(D, w.market, 'potion_health', p.id).sellSuggest; // ninguém vendendo
    const bank = p.bankGold;
    expect(sim.marketSellAll(['sword_iron', 'potion_health', 'bone_fragment', 'helmet_iron'])).toBe(true);
    const mine = w.market.offers.filter((o) => o.ownerId === p.id);
    expect(mine).toHaveLength(2);
    expect(mine.find((o) => o.itemId === 'sword_iron')).toMatchObject({ side: 'sell', count: 1, price: 259 });
    expect(mine.find((o) => o.itemId === 'potion_health')).toMatchObject({ side: 'sell', count: 8, price: suggested });
    expect(countItem(p.inventory, 'potion_health') + countItem(p.depot, 'potion_health')).toBe(0);
    expect(countItem(p.inventory, 'bone_fragment')).toBe(4);
    expect(p.bankGold).toBe(bank);
    expect(offersFor(w.market, 'sword_iron', 'buy')).toHaveLength(1);
    // nada mais para anunciar
    expect(sim.marketSellAll(['sword_iron', 'potion_health'])).toBe(false);
    expect(w.market.offers.filter((o) => o.ownerId === p.id)).toHaveLength(2);
  });

  it('preço de referência e sugestões seguem a oferta e a procura', () => {
    const { w } = setup();
    offer(w, 'sell', 'a', 'sword_iron', 2, 260);
    offer(w, 'buy', 'b', 'sword_iron', 1, 200);
    let g = priceGuide(D, w.market, 'sword_iron');
    expect(g.sellSuggest).toBe(259); // um abaixo do menor anúncio
    expect(g.buySuggest).toBe(201); // um acima da maior oferta
    expect(g.ref).toBe(230); // sem negócios: o meio do livro
    w.market.history.sword_iron = [
      { price: 240, count: 1, at: 1 },
      { price: 250, count: 1, at: 2 },
    ];
    g = priceGuide(D, w.market, 'sword_iron');
    expect(g.last).toBe(250);
    expect(g.ref).toBeGreaterThanOrEqual(240);
    expect(g.ref).toBeLessThanOrEqual(250);
  });

  it('salvo e lido de novo; mercado de outra temporada recomeça vazio', () => {
    const { w } = setup();
    offer(w, 'sell', 's', 'sword_iron', 1, 200);
    offer(w, 'buy', 'b', 'helmet_iron', 2, 90);
    w.market.history.sword_iron = [{ price: 210, count: 1, at: 3 }];
    w.market.proceeds = { s: 10 };
    const saved = JSON.parse(JSON.stringify({ ...w.market, season: SEASON }));
    expect(parseMarket(D, saved)).toEqual(w.market);
    // temporada anterior (ou formato antigo, sem temporada): vazio
    expect(parseMarket(D, { ...saved, season: SEASON - 1 }).offers).toHaveLength(0);
    expect(parseMarket(D, { listings: [{ id: 'mk1', sellerId: 's', itemId: 'sword_iron', count: 1, price: 200 }] }).offers).toHaveLength(0);
  });
});

describe('mercado: categorias, filtros e comparação', () => {
  it('cada equipamento e poção cai numa categoria (armas por tipo, defesa, acessórios, poções)', () => {
    expect(categoryOf(D.items.sword_iron)).toBe('sword');
    expect(categoryOf(D.items.axe_battle)).toBe('axe');
    expect(categoryOf(D.items.bow_elven)).toBe('distance');
    expect(categoryOf(D.items.wand_ember)).toBe('wand');
    expect(categoryOf(D.items.rod_sprout)).toBe('rod');
    expect(categoryOf(D.items.shield_iron)).toBe('shield');
    expect(categoryOf(D.items.spellbook)).toBe('spellbook');
    expect(categoryOf(D.items.legs_plate)).toBe('legs');
    expect(categoryOf(D.items.potion_mana_great)).toBe('potion_mana');
    expect(categoryOf(D.items.bone_fragment)).toBeNull();
    const cat = buildCatalog(D);
    expect(cat.every((c) => marketable(D.items[c.itemId]))).toBe(true);
    expect(cat.find((c) => c.itemId === 'sword_steel')).toMatchObject({ minLevel: 8, attack: 20 });
  });

  it('mostra se o item é melhor ou pior que o seu, ou por que não serve (nível, vocação)', () => {
    const sim = makeSim('knight');
    const c = sim.world.player.character;
    c.level = 12;
    expect(compareItem(D, c, D.items.sword_steel!).fit).toBe('better');
    expect(compareItem(D, c, D.items.sword_steel!).attack).toBeGreaterThan(0);
    expect(compareItem(D, c, D.items.dagger!).fit).toBe('worse');
    expect(compareItem(D, c, D.items.armor_plate!).fit).toBe('better');
    expect(compareItem(D, c, D.items.sword_dragon!).fit).toBe('level');
    expect(compareItem(D, c, D.items.robe_mystic!).fit).toBe('vocation');
    const snap = buildSnapshot(sim, 1);
    expect(snap.market).toBeNull(); // só com a janela do corretor aberta
  });
});

describe('mercado: os heróis negociam', () => {
  it('vendem o equipamento do loot para quem paga mais que a loja e anunciam o resto; materiais ficam para a loja', () => {
    const { sim, w, h, asHero } = setup(20);
    const p = w.human.character;
    p.gold = 5000;
    sim.marketOffer('buy', 'bow_elven', 1, 700); // a loja paga 490
    const inv = h.character.inventory;
    inv.fill(null);
    inv[0] = { itemId: 'bow_elven', count: 1 };
    inv[1] = { itemId: 'robe_mystic', count: 1 };
    inv[2] = { itemId: 'bone_fragment', count: 10 };
    asHero(() => heroHelpers.marketing(w, h));
    expect(countItem(p.depot, 'bow_elven')).toBe(1); // vendeu para a oferta do jogador
    const robe = w.market.offers.find((o) => o.ownerId === h.character.id && o.itemId === 'robe_mystic');
    expect(robe?.side).toBe('sell');
    expect(robe!.price).toBeGreaterThan(Math.round(1100 * 0.35)); // mais que a loja pagaria
    expect(countItem(inv, 'bone_fragment')).toBe(10); // material: só a loja compra
  });

  it('compram poções mais baratas que a loja (nunca acima dela) e o upgrade que está à venda', () => {
    const { w, h, asHero } = setup(10);
    offer(w, 'sell', 'x', 'potion_health', 40, 30);
    offer(w, 'sell', 'y', 'potion_health', 40, 80); // acima da loja: não compra
    offer(w, 'sell', 'z', 'sword_steel', 1, 500); // a loja cobra 900
    h.character.gold = 3000;
    h.character.inventory = h.character.inventory.map(() => null);
    asHero(() => heroHelpers.marketing(w, h));
    expect(countItem(h.character.inventory, 'potion_health')).toBeGreaterThan(5);
    expect(w.market.offers.find((o) => o.ownerId === 'y')!.count).toBe(40);
    expect(h.character.equipment.mainHand?.itemId).toBe('sword_steel');
  });

  it('o que precisa para evoluir e não acha: deixa a oferta de quanto paga; com ouro para a loja, cancela e compra lá', () => {
    const { w, h, asHero } = setup(15);
    h.character.gold = 0;
    h.character.bankGold = 2400;
    h.brain.goal = { itemId: 'armor_plate', price: 2700 };
    asHero(() => heroHelpers.marketing(w, h));
    const bid = w.market.offers.find((o) => o.ownerId === h.character.id && o.side === 'buy');
    expect(bid?.itemId).toBe('armor_plate');
    expect(bid!.price).toBeLessThan(2700); // paga menos que a loja
    expect(escrowOf(w.market, h.character.id)).toBe(bid!.price);
    // alguém anuncia pelo preço da oferta: fecha na hora e a armadura chega no depósito
    offer(w, 'sell', 'vendedor', 'armor_plate', 1, bid!.price);
    // (o anúncio "de fora" não cruza sozinho: quem cruza é quem chega depois; aqui o herói passa de novo no mercado)
    asHero(() => heroHelpers.marketing(w, h));
    expect(h.character.equipment.body?.itemId).toBe('armor_plate');
  });

  it('com ouro para comprar a meta na loja, cancela a oferta de compra (o ouro volta ao banco)', () => {
    const { w, h, asHero } = setup(15);
    h.character.gold = 0;
    h.character.bankGold = 2400;
    h.brain.goal = { itemId: 'armor_plate', price: 2700 };
    asHero(() => heroHelpers.marketing(w, h));
    expect(escrowOf(w.market, h.character.id)).toBeGreaterThan(0);
    h.character.bankGold += 3000;
    asHero(() => heroHelpers.marketing(w, h));
    expect(escrowOf(w.market, h.character.id)).toBe(0);
  });
});

describe('mercado: registro de compras e vendas', () => {
  it('anota cada negócio dos dois lados, com preço por unidade, e persiste', () => {
    const { sim, w } = setup();
    const p = w.human.character;
    offer(w, 'sell', 'caro', 'potion_health', 10, 60);
    offer(w, 'sell', 'barato', 'potion_health', 3, 30);
    p.gold = 1000;
    expect(sim.marketBuyNow('potion_health', 5, 60)).toBe(true); // 3 a 30 + 2 a 60
    expect(w.market.log[p.id]).toEqual([
      { kind: 'buy', itemId: 'potion_health', count: 3, price: 30, at: expect.any(Number) },
      { kind: 'buy', itemId: 'potion_health', count: 2, price: 60, at: expect.any(Number) },
    ]);
    expect(w.market.log.barato).toEqual([{ kind: 'sell', itemId: 'potion_health', count: 3, price: 30, at: expect.any(Number) }]);
    p.inventory[0] = { itemId: 'sword_iron', count: 1 };
    offer(w, 'buy', 'fora', 'sword_iron', 1, 250);
    expect(sim.marketSellNow('sword_iron', 1)).toBe(true);
    expect(w.market.log[p.id]!.at(-1)).toMatchObject({ kind: 'sell', itemId: 'sword_iron', count: 1, price: 250 });
    expect(w.market.log.fora).toMatchObject([{ kind: 'buy', itemId: 'sword_iron', count: 1, price: 250 }]);
    const back = parseMarket(D, JSON.parse(JSON.stringify({ ...w.market, season: SEASON })));
    expect(back.log).toEqual(w.market.log);
    expect(buildSnapshot(sim, 1).market?.log[0]).toMatchObject({ kind: 'sell', itemId: 'sword_iron' });
  });
});
