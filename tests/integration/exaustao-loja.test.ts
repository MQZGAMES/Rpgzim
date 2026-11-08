// Exaustão por grupo (atacar e curar ao mesmo tempo, 2 s entre magias de ataque, 2 s entre curas, poções à parte) e a
// loja com "Comprar no mercado" quando o mercado está mais barato que a loja, filtros por categoria e nível mínimo.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { countItem } from '../../src/domain/rules/inventory';
import type { World } from '../../src/game/simulation/World';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { refreshStats } from '../../src/game/progression/progression';
import { advance, makeSim } from '../helpers';

function druidVsSlime() {
  const sim = makeSim('druid', { seed: 3 });
  const w = sim.world;
  const c = w.player.character;
  c.level = 30;
  c.skills.magic.level = 25;
  refreshStats(w);
  sim.teleportPlayer(80, 22);
  advance(sim, 50, 50);
  c.mana = 5000;
  c.health = Math.round(w.player.stats.maxHealth * 0.5);
  return { sim, w, c };
}

describe('exaustão por grupo', () => {
  it('atacar não impede curar: magia de ataque e de cura no mesmo instante', () => {
    const { sim, w } = druidVsSlime();
    const slime = [...w.monsters.values()].filter((m) => m.alive && m.def.id === 'slime').sort((a, b) => Math.hypot(a.x - w.player.x, a.y - w.player.y) - Math.hypot(b.x - w.player.x, b.y - w.player.y))[0]!;
    sim.teleportPlayer(slime.x, slime.y + 2);
    w.player.targetId = slime.id;
    w.player.character.mana = 5000;
    expect(sim.castSpell('earth_thorn')).toBe(true);
    expect(sim.castSpell('light_heal')).toBe(true); // a cura não espera a exaustão do ataque
  });

  it('duas magias de ataque precisam de 2 s entre elas (mesmo com a outra pronta)', async () => {
    const { sim, w } = druidVsSlime();
    const slime = [...w.monsters.values()].find((m) => m.alive && m.def.id === 'slime')!;
    sim.teleportPlayer(slime.x, slime.y + 2);
    w.player.targetId = slime.id;
    w.player.character.mana = 5000;
    slime.hp = 1e6;
    expect(sim.castSpell('earth_thorn')).toBe(true);
    expect(sim.castSpell('ice_shard')).toBe(false); // ainda na exaustão de ataque
    advance(sim, 1000, 50);
    w.player.character.mana = 5000;
    expect(sim.castSpell('ice_shard')).toBe(false); // 1 s depois: ainda não
    advance(sim, 1100, 50);
    w.player.character.mana = 5000;
    sim.teleportPlayer(slime.x, slime.y + 2); // (a criatura andou: de volta ao alcance)
    w.player.targetId = slime.id;
    expect(sim.castSpell('ice_shard')).toBe(true); // passou 2 s
  });

  it('duas curas precisam de 2 s; poção não depende das magias', () => {
    const { sim, w, c } = druidVsSlime();
    expect(sim.castSpell('light_heal')).toBe(true);
    c.health = Math.round(w.player.stats.maxHealth * 0.3);
    expect(sim.castSpell('light_heal')).toBe(false);
    // poção ao mesmo tempo que a cura (a exaustão das poções é só delas)
    c.inventory.fill(null);
    c.inventory[0] = { itemId: 'potion_health', count: 5 };
    expect(sim.useItem(0)).toBe(true);
    advance(sim, 2100, 50);
    c.health = Math.round(w.player.stats.maxHealth * 0.3);
    expect(sim.castSpell('light_heal')).toBe(true);
  });
});

function offer(w: World, owner: string, itemId: string, count: number, price: number) {
  w.market.offers.push({ id: `x${++w.market.seq}`, side: 'sell', ownerId: owner, ownerName: owner, itemId, count, price, at: 0 });
}

describe('loja com mercado e filtros', () => {
  it('mostra o mercado só quando está mais barato que a loja e compra de lá sem sair da loja', () => {
    const sim = makeSim('knight', { seed: 2 });
    const w = sim.world;
    const npc = [...w.npcs.values()].find((n) => n.def.shopId === 'equipment')!;
    w.ui.shop = { shopId: 'equipment', npcId: npc.id };
    const c = w.player.character;
    c.inventory.fill(null);
    c.gold = 1000;
    const shopPrice = GAME_DATA.shops.equipment!.sells.find((o) => o.itemId === 'shield_wood')!.price;
    offer(w, 'outro', 'shield_wood', 1, shopPrice + 50); // mais caro: não aparece
    let view = buildSnapshot(sim, 1).shop!.sells.find((o) => o.item.itemId === 'shield_wood')!;
    expect(view.market).toBeNull();
    offer(w, 'outro', 'shield_wood', 2, Math.max(1, shopPrice - 10));
    view = buildSnapshot(sim, 2).shop!.sells.find((o) => o.item.itemId === 'shield_wood')!;
    expect(view.market).toEqual({ price: Math.max(1, shopPrice - 10), units: 2 });
    // compra 3: só as 2 mais baratas que a loja saem do mercado (a mais cara fica)
    expect(sim.marketBuyAtShop('shield_wood', 3)).toBe(true);
    expect(countItem(c.inventory, 'shield_wood')).toBe(2);
    expect(c.gold).toBe(1000 - 2 * Math.max(1, shopPrice - 10));
    expect(w.market.offers.some((o) => o.itemId === 'shield_wood' && o.price === shopPrice + 50)).toBe(true);
    // sem a loja aberta não compra
    w.ui.shop = null;
    offer(w, 'outro', 'shield_wood', 1, 1);
    expect(sim.marketBuyAtShop('shield_wood', 1)).toBe(false);
  });

  it('cada item da loja tem categoria e nível mínimo (para os filtros e a ordem)', () => {
    const sim = makeSim('knight', { seed: 2 });
    const w = sim.world;
    const npc = [...w.npcs.values()].find((n) => n.def.shopId === 'potions')!;
    w.ui.shop = { shopId: 'potions', npcId: npc.id };
    const sells = buildSnapshot(sim, 1).shop!.sells;
    const great = sells.find((o) => o.item.itemId === 'potion_health_great')!;
    expect(great.item.category).toBe('potion_health');
    expect(great.item.minLevel).toBe(12);
    expect(great.item.blockedReason).toMatch(/nível 12/);
    expect(sells.find((o) => o.item.itemId === 'potion_health')!.item.blockedReason).toBeNull();
  });
});
