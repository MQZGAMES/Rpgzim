// Mercado do banco, logar/deslogar personagens com IA, nível mágico por vocação (a cura dos magos), custo de mana que
// sobe com o nível, magias opcionais, poções à venda, criaturas que cercam e a perseguição que não trava.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { customHeroDef } from '../../src/data/heroes';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { defaultHotbar } from '../../src/domain/rules/hotbar';
import { autoPrice } from '../../src/domain/rules/market';
import { triesForNextLevel } from '../../src/domain/rules/skills';
import { spellManaCost } from '../../src/domain/rules/spells';
import { spellRange } from '../../src/domain/rules/damage';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { heroHelpers } from '../../src/game/ai/heroBrain';
import { placeOccupant, removeOccupant } from '../../src/game/movement/movement';
import { invite, acceptInvite, partyOf } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { isPz, isSolid } from '../../src/game/world/GameMap';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function withHero(id = 'boladex') {
  const sim = makeSim('knight', { seed: 31 });
  const w = sim.world;
  const def = D.heroes[id]!;
  const c = createCharacter(D, {
    id: def.slotId,
    name: def.name,
    vocation: def.vocation,
    now: 0,
    position: w.map.playerStart,
  });
  const h = sim.addHero(def, c) as HeroEntity;
  h.brain.nextThinkAt = Infinity;
  return { sim, w, h };
}

/** Abre o banco para quem está agindo (jogador ou herói dentro de asActor). */
function openBank(w: ReturnType<typeof withHero>['w']) {
  const npc = [...w.npcs.values()].find((n) =>
    n.def.dialog[0]?.options.some((o) => o.action === 'openDepot'),
  )!;
  w.ui.depot = { npcId: npc.id };
}

describe('mercado do banco', () => {
  it('anuncia (venda automática a 75% do valor), outro compra: item no depósito, ouro no banco do vendedor', () => {
    const { sim, w, h } = withHero();
    const p = w.human;
    p.character.inventory[0] = { itemId: 'sword_iron', count: 1 };
    openBank(w);
    expect(sim.marketAutoList('inventory', 0)).toBe(true);
    expect(p.character.inventory[0]).toBeNull();
    const l = w.market.listings[0]!;
    expect(l.price).toBe(autoPrice(D, 'sword_iron'));
    expect(l.price).toBe(Math.round(D.items.sword_iron!.value * 0.75));
    expect(sim.marketBuy(l.id)).toBe(false); // o próprio anúncio não se compra
    // o herói compra: vai para o depósito dele; o ouro cai no banco do jogador
    h.character.gold = 5000;
    const bank = p.character.bankGold;
    asActor(w, h, () => {
      openBank(w);
      expect(sim.marketBuy(l.id)).toBe(true);
    });
    expect(countItem(h.character.depot, 'sword_iron')).toBe(1);
    expect(p.character.bankGold).toBe(bank + l.price);
    expect(w.market.listings).toHaveLength(0);
  });

  it('sem espaço no depósito não compra; retirar o anúncio devolve o item ao depósito', () => {
    const { sim, w, h } = withHero();
    const p = w.human;
    p.character.inventory[0] = { itemId: 'sword_iron', count: 1 };
    openBank(w);
    expect(sim.marketList('inventory', 0, 77)).toBe(true);
    const id = w.market.listings[0]!.id;
    h.character.gold = 5000;
    h.character.depot = new Array(D.balance.player.depotSlots)
      .fill(null)
      .map(() => ({ itemId: 'bone_fragment', count: 1 }));
    asActor(w, h, () => {
      openBank(w);
      expect(sim.marketBuy(id)).toBe(false);
    });
    expect(sim.marketCancel(id)).toBe(true);
    expect(countItem(p.character.depot, 'sword_iron')).toBe(1);
    expect(buildSnapshot(sim, 1).market?.orders).toHaveLength(0);
  });

  it('venda de quem está fora do jogo fica guardada e entra no banco quando ele loga', () => {
    const { sim, w } = withHero();
    w.market.listings.push({
      id: 'mk99',
      sellerId: 'offline_x',
      sellerName: 'Fulano',
      itemId: 'sword_iron',
      count: 1,
      price: 50,
      listedAt: 0,
    });
    w.human.character.gold = 100;
    openBank(w);
    expect(sim.marketBuy('mk99')).toBe(true);
    expect(w.market.proceeds.offline_x).toBe(50);
    const c = createCharacter(D, {
      id: 'offline_x',
      name: 'Fulano',
      vocation: 'paladin',
      now: 0,
      position: w.map.playerStart,
    });
    const bank = c.bankGold;
    sim.addHero(customHeroDef(c), c);
    expect(c.bankGold).toBe(bank + 50);
    expect(w.market.proceeds.offline_x).toBeUndefined();
  });

  it('o herói compra no mercado (no preço do NPC ou abaixo) antes de ir à loja', () => {
    const { w, h } = withHero();
    w.market.listings.push({
      id: 'mk1',
      sellerId: w.human.character.id,
      sellerName: 'Você',
      itemId: 'potion_health',
      count: 10,
      price: 30,
      listedAt: 0,
    });
    h.character.gold = 1000;
    h.character.inventory = h.character.inventory.map(() => null);
    asActor(w, h, () => {
      openBank(w);
      heroHelpers.useMarket(w, h);
    });
    expect(countItem(h.character.inventory, 'potion_health')).toBe(10);
    expect(w.market.listings).toHaveLength(0);
  });
});

describe('logar e deslogar personagens com IA', () => {
  it('qualquer personagem criado entra jogando sozinho e sai do mundo (e do grupo)', () => {
    const { sim, w } = withHero();
    const c = createCharacter(D, {
      id: 'meu_druid',
      name: 'Folha',
      vocation: 'druid',
      now: 0,
      position: w.map.playerStart,
    });
    const def = customHeroDef(c);
    expect(def.vocation).toBe('druid');
    expect(JSON.stringify(def.lines)).not.toContain('Boladex');
    const h = sim.addHero(def, c) as HeroEntity;
    expect(buildSnapshot(sim, 1).heroes.some((x) => x.id === h.id)).toBe(true);
    advance(sim, 3000, 50); // pensa e age como os heróis
    expect(h.brain.mode).not.toBe('dead');
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    expect(partyOf(w, h.id)).toBeTruthy();
    expect(sim.removeHero(h.hero.id)).toBe(h);
    expect(w.heroes.has(h.id)).toBe(false);
    expect(partyOf(w, w.human.id)?.members.includes(h.id) ?? false).toBe(false);
    expect(w.occupancy.get(h.y * w.map.width + h.x)).not.toBe(h.id);
  });
});

describe('magos: nível mágico, cura e mana', () => {
  it('o Magic Level dos magos sobe muito mais rápido que o do Knight e do Paladin', () => {
    const b = D.balance;
    const need = (v: 'sorcerer' | 'paladin' | 'knight', ml: number) =>
      triesForNextLevel('magic', ml, D.vocations[v].skillMultipliers.magic, b, D.vocations[v].magicGrowth);
    expect(need('knight', 20) / need('sorcerer', 20)).toBeGreaterThan(50);
    expect(need('paladin', 20) / need('sorcerer', 20)).toBeGreaterThan(5);
  });

  it('a cura cresce com o Magic Level: mago cura bem mais que o Knight do mesmo nível', () => {
    const f = D.spells.light_heal!.formula!;
    const heal = (v: 'sorcerer' | 'knight', ml: number) => {
      const [a, z] = spellRange(f, { level: 50, power: ml, weaponAttack: 0 }, D.vocations[v].damage.healing);
      return (a + z) / 2;
    };
    expect(heal('sorcerer', 40) / heal('knight', 12)).toBeGreaterThan(2);
  });

  it('as magias de ataque dos magos custam mais mana conforme o nível', () => {
    const lance = D.spells.flame_lance!;
    expect(spellManaCost(lance, 1)).toBeLessThan(30);
    expect(spellManaCost(lance, 60)).toBeGreaterThan(45);
    expect(spellManaCost(D.spells.light_heal!, 60)).toBe(D.spells.light_heal!.manaCost); // a cura básica não sobe
    const sim = makeSim('sorcerer');
    sim.world.player.character.level = 60;
    const view = buildSnapshot(sim, 1).spellbook.find((s) => s.id === 'flame_lance')!;
    expect(view.manaCost).toBe(spellManaCost(lance, 60));
  });
});

describe('magias opcionais e poções', () => {
  it('2 magias inéditas por vocação, fora da barra padrão (que continua igual)', () => {
    const extra: Record<string, string[]> = {
      sorcerer: ['thunder_strike', 'inferno_rain'],
      druid: ['ice_shard', 'stone_skin'],
      paladin: ['holy_light', 'sacred_fire'],
      knight: ['berserk', 'second_wind'],
    };
    for (const [voc, ids] of Object.entries(extra)) {
      const v = D.vocations[voc as keyof typeof D.vocations];
      for (const id of ids) {
        expect(D.spells[id]?.vocations).toContain(voc);
        expect(v.spells).toContain(id);
        expect(defaultHotbar(D, v.id)).not.toContain(`spell:${id}`);
      }
    }
  });

  it('todas as poções existentes estão à venda na Alquimia e na Banca do Ilário', () => {
    const potions = Object.values(D.items).filter((i) => i.type === 'potion');
    for (const shopId of ['potions', 'general'])
      for (const p of potions)
        expect(
          D.shops[shopId]!.sells.some((o) => o.itemId === p.id),
          `${shopId} ${p.id}`,
        ).toBe(true);
  });
});

describe('criaturas e perseguição', () => {
  function openArea(w: ReturnType<typeof withHero>['w']) {
    for (let y = 10; y < w.map.height - 10; y++)
      for (let x = 10; x < w.map.width - 10; x++) {
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++)
          for (let dx = -3; dx <= 3 && ok; dx++)
            if (
              isSolid(w.map, x + dx, y + dy) ||
              isPz(w.map, x + dx, y + dy) ||
              w.occupancy.has((y + dy) * w.map.width + x + dx)
            )
              ok = false;
        if (ok) return { x, y };
      }
    throw new Error('sem área aberta');
  }

  it('várias criaturas cercam o alvo (casas diferentes ao redor dele), em vez de fazer fila', () => {
    const { sim, w } = withHero();
    const p = w.human;
    for (const m of w.monsters.values()) m.alive = false;
    const at = openArea(w);
    sim.teleportPlayer(at.x, at.y);
    const wolves = [...w.monsters.values()].filter((m) => m.def.id === 'wolf').slice(0, 3) as MonsterEntity[];
    wolves.forEach((m, i) => {
      removeOccupant(w, m as unknown as HeroEntity);
      m.alive = true;
      m.hp = m.def.health;
      m.x = at.x + 3;
      m.y = at.y - 1 + i;
      m.homeX = m.x;
      m.homeY = m.y;
      m.state = 'chasing';
      m.targetId = p.id;
      placeOccupant(w, m as unknown as HeroEntity);
    });
    for (let i = 0; i < 40; i++) {
      advance(sim, 100, 50);
      p.character.health = p.stats.maxHealth;
    }
    const adjacent = wolves.filter((m) => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 1);
    expect(adjacent.length).toBe(3);
    expect(new Set(adjacent.map((m) => `${m.x},${m.y}`)).size).toBe(3);
  });
});
