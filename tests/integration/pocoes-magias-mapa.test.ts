// Poções por tamanho com nível mínimo, magias de criação de cada poção, magias de grau II/III, magia de ataque que
// também é o ataque básico, guardas da vila, preços no item, configurações por personagem e as Terras do Sul.
import { describe, expect, it } from 'vitest';
import manifest from '../../src/assets/generated/manifest.json';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { bestPotionFor, potionsByKind } from '../../src/domain/rules/potions';
import { spellTiers } from '../../src/domain/rules/spells';
import { spellRange } from '../../src/domain/rules/damage';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { heroHelpers } from '../../src/game/ai/heroBrain';
import { placeOccupant, removeOccupant } from '../../src/game/movement/movement';
import { acceptInvite, invite, partyOf } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function heroOf(sim: ReturnType<typeof makeSim>, id: string, level: number, ml = 0): HeroEntity {
  const def = D.heroes[id]!;
  const c = createCharacter(D, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: sim.world.map.playerStart });
  c.level = level;
  if (ml) c.skills.magic.level = ml;
  const h = sim.addHero(def, c) as HeroEntity;
  h.brain.nextThinkAt = Infinity;
  return h;
}

describe('poções por tamanho', () => {
  it('cada tamanho cura mais, pede mais nível e custa menos (ou igual) por ponto; as pequenas servem para todos', () => {
    for (const kind of ['heal', 'mana'] as const) {
      const ps = potionsByKind(D, kind);
      expect(ps).toHaveLength(5);
      expect(ps[0]!.minLevel ?? 1).toBe(1);
      for (let i = 1; i < ps.length; i++) {
        const [a, b] = [ps[i - 1]!, ps[i]!];
        expect(b.use![kind]! / a.use![kind]!, b.id).toBeGreaterThanOrEqual(1.6); // tamanhos bem diferentes
        expect(b.minLevel!, b.id).toBeGreaterThan(a.minLevel ?? 1);
        expect(b.value / b.use![kind]!, b.id).toBeLessThanOrEqual((a.value / a.use![kind]!) * 1.08);
      }
    }
  });

  it('sem o nível mínimo não bebe; o atalho automático só conta (e usa) as que ele pode beber', () => {
    const sim = makeSim('knight');
    const p = sim.world.player;
    p.character.inventory = p.character.inventory.map(() => null);
    p.character.inventory[0] = { itemId: 'potion_health_supreme', count: 5 };
    p.character.inventory[1] = { itemId: 'potion_health', count: 2 };
    p.character.health = 20;
    expect(sim.useItemById('potion_health_supreme')).toBe(false); // nível 1: a Grande pede o 28
    const slot = buildSnapshot(sim, 1).hotbar.find((s) => s.kind === 'potion' && s.itemId === 'health')!;
    expect(slot.count).toBe(2);
    p.character.level = 30;
    sim.update(16);
    expect(buildSnapshot(sim, 2).hotbar.find((s) => s.kind === 'potion' && s.itemId === 'health')!.count).toBe(7);
    expect(sim.useItemById('potion_health_supreme')).toBe(true);
    expect(bestPotionFor(D, 30, 'heal')!.id).toBe('potion_health_supreme');
  });

  it('o herói compra a poção do nível dele e vende as pequenas que sobraram', () => {
    const sim = makeSim('knight', { seed: 4 });
    const w = sim.world;
    const h = heroOf(sim, 'boladex', 32);
    h.character.inventory = h.character.inventory.map(() => null);
    h.character.inventory[0] = { itemId: 'potion_health', count: 30 };
    h.character.gold = 30000;
    const npc = [...w.npcs.values()].find((n) => n.def.shopId === 'potions')!;
    asActor(w, h, () => {
      w.ui.shop = { shopId: 'potions', npcId: npc.id };
      heroHelpers.buyPotions(w, h, npc.id);
    });
    expect(countItem(h.character.inventory, 'potion_health_supreme')).toBeGreaterThan(5);
    expect(countItem(h.character.inventory, 'potion_health_spirit')).toBe(0); // acima do nível dele: nunca compra
    expect(countItem(h.character.inventory, 'potion_health')).toBeLessThanOrEqual(3); // vendeu as pequenas
  });
});

describe('magias de criação de cada poção', () => {
  it('o Druid cria as 5 poções de vida e o Sorcerer as 5 de mana, cada uma depois do nível da poção', () => {
    for (const [voc, kind] of [['druid', 'heal'], ['sorcerer', 'mana']] as const) {
      const made = D.vocations[voc].spells.map((id) => D.spells[id]!).filter((s) => s.effect === 'conjure');
      const items = new Set(made.map((s) => s.conjure!.itemId));
      for (const p of potionsByKind(D, kind)) expect(items.has(p.id), `${voc} ${p.id}`).toBe(true);
    }
  });

  it('o mago da IA cria a maior poção que já pode beber', () => {
    const sim = makeSim('knight', { seed: 9 });
    const w = sim.world;
    const h = heroOf(sim, 'maguim', 40, 30);
    h.character.inventory = h.character.inventory.map(() => null);
    sim.update(16);
    h.stats.maxMana = 3000; // mana de sobra: cabe a maior que ele já bebe (a Grande, nível 28)
    h.character.mana = 3000;
    asActor(w, h, () => heroHelpers.conjurePotions(w, h));
    expect(countItem(h.character.inventory, 'potion_mana_supreme')).toBe(1);
  });
});

describe('magias de grau II e III', () => {
  it('cada vocação ganha graus II/III da magia de alvo único, da de área e da cura, nos mesmos níveis', () => {
    const levels = (voc: keyof typeof D.vocations) =>
      D.vocations[voc].spells
        .map((id) => D.spells[id]!)
        .filter((s) => s.baseId)
        .map((s) => s.minLevel)
        .sort((a, b) => a - b)
        .join(',');
    expect(levels('sorcerer')).toBe(levels('knight'));
    expect(levels('druid')).toBe(levels('paladin'));
    expect(levels('sorcerer')).toBe(levels('paladin'));
    for (const voc of Object.keys(D.vocations) as (keyof typeof D.vocations)[])
      expect(D.vocations[voc].spells.filter((id) => D.spells[id]!.baseId).length).toBe(6);
  });

  it('o II e o III batem mais forte e custam mais mana por ponto de dano', () => {
    const t = spellTiers(D.spells, 'arcane_bolt');
    expect(t).toEqual(['arcane_bolt', 'arcane_bolt_2', 'arcane_bolt_3']);
    const avg = (id: string) => {
      const [a, b] = spellRange(D.spells[id]!.formula!, { level: 60, power: 40, weaponAttack: 0 }, 1);
      return (a + b) / 2;
    };
    expect(avg(t[1]!)).toBeGreaterThan(avg(t[0]!) * 1.3);
    expect(avg(t[2]!)).toBeGreaterThan(avg(t[1]!) * 1.2);
    expect(D.spells[t[2]!]!.manaCost / avg(t[2]!)).toBeGreaterThan(D.spells[t[0]!]!.manaCost / avg(t[0]!));
    expect(D.spells.arcane_bolt_2!.name).toBe('Faísca Arcana II');
  });

  it('a IA usa o maior grau liberado com mana sobrando e o I com a mana curta', () => {
    const sim = makeSim('knight', { seed: 2 });
    const w = sim.world;
    const h = heroOf(sim, 'maguim', 50, 40);
    sim.update(16);
    const slime = [...w.monsters.values()].find((m) => m.alive)!;
    slime.hp = 1e9; // não morre no primeiro golpe
    const casts: string[] = [];
    w.events.on('spellCast', (e) => e.casterId === h.id && casts.push(e.spellId));
    asActor(w, h, () => {
      removeOccupant(w, h);
      h.x = slime.x + 2;
      h.y = slime.y;
      placeOccupant(w, h);
      h.targetId = slime.id;
      h.character.mana = h.stats.maxMana;
      heroHelpers.tryCast(w, h, 'arcane_bolt');
      for (const k of Object.keys(h.cooldowns)) delete (h.cooldowns as Record<string, number>)[k];
      h.character.mana = Math.floor(h.stats.maxMana * 0.3);
      heroHelpers.tryCast(w, h, 'arcane_bolt');
    });
    expect(casts).toEqual(['arcane_bolt_3', 'arcane_bolt']);
  });
});

describe('magia de ataque também é o ataque básico', () => {
  it('sem mana a magia não sai, mas mira a criatura mais próxima e o ataque básico começa', () => {
    const sim = makeSim('sorcerer', { seed: 5 });
    const w = sim.world;
    const p = w.player;
    const m = [...w.monsters.values()].find((x) => x.def.id === 'slime')! as MonsterEntity;
    removeOccupant(w, p);
    p.x = m.x - 2;
    p.y = m.y;
    placeOccupant(w, p);
    p.character.mana = 0;
    expect(sim.castSpell('flame_lance')).toBe(false);
    expect(p.targetId).toBe(m.id);
    const hp = m.hp;
    advance(sim, 3000, 50);
    expect(m.hp < hp || !m.alive).toBe(true);
  });
});

describe('guardas da vila', () => {
  it('criatura lurada para dentro da vila é abatida pela guarda, sem XP nem loot para ninguém', () => {
    const sim = makeSim('knight', { seed: 6 });
    const w = sim.world;
    const p = w.player;
    const boar = [...w.monsters.values()].find((x) => x.def.id === 'boar')! as MonsterEntity;
    removeOccupant(w, boar as unknown as HeroEntity);
    boar.x = 66;
    boar.y = 22; // avenida da vila, perto do portão leste
    boar.homeX = boar.x;
    boar.homeY = boar.y;
    boar.state = 'idle';
    placeOccupant(w, boar as unknown as HeroEntity);
    const xp = p.character.experience;
    const bags = w.lootBags.size;
    advance(sim, 3000, 50);
    expect(boar.alive).toBe(false);
    expect(p.character.experience).toBe(xp);
    expect(w.lootBags.size).toBe(bags);
  });
});

describe('preço do item e configurações por personagem', () => {
  it('o item mostra quanto a loja paga e o anúncio mais barato do mercado', () => {
    const sim = makeSim('knight');
    const w = sim.world;
    w.player.character.inventory[0] = { itemId: 'sword_iron', count: 1 };
    w.market.offers.push({ id: 'mk1', side: 'sell', ownerId: 'x', ownerName: 'X', itemId: 'sword_iron', count: 1, price: 200, at: 0 });
    const it = buildSnapshot(sim, 1).inventory[0]!;
    expect(it.npcSell?.price).toBe(Math.round(340 * 0.35));
    expect(it.market).toEqual({ price: 200, listings: 1 });
  });

  it('as ajudas automáticas e as regras do grupo ficam salvas no personagem', () => {
    const sim = makeSim('knight', { seed: 3 });
    const w = sim.world;
    const c = w.human.character;
    c.settings = { auto: { autoHeal: true, spellHeal: true, healBelow: 0.7 }, party: { formation: 'line', targeting: 'nearest' } };
    const back = parseSave(D, toSaveFile(c)).character;
    expect(back.settings?.auto).toMatchObject({ autoHeal: true, healBelow: 0.7 });
    // o próximo grupo que ele lidera nasce com as regras dele
    const h = heroOf(sim, 'boladex', 5);
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    expect(partyOf(w, h.id)).toMatchObject({ formation: 'line', targeting: 'nearest' });
  });
});

describe('Terras do Sul', () => {
  it('12 criaturas novas, nenhuma humana, cada uma com sprite, troféu à venda e área no mapa', () => {
    const ids = ['bog_slime', 'marsh_toad', 'cave_spider', 'widow_spider', 'hyena', 'rhino_boar', 'cave_bear', 'green_wyvern', 'basilisk', 'storm_wolf', 'crystal_scorpion', 'magma_slime'];
    const sim = makeSim('knight');
    const onMap = new Set(sim.world.map.spawns.map((s) => s.monsterId));
    const sheets = manifest.sheets as Record<string, { kind: string }>;
    for (const id of ids) {
      const m = D.monsters[id]!;
      expect(m, id).toBeDefined();
      expect(sheets[m.sprite]?.kind, id).not.toBe('humanoid');
      expect(onMap.has(id), id).toBe(true);
      const trophy = m.loot[0]!.itemId;
      expect(Object.values(D.shops).some((s) => s.buys.some((o) => o.itemId === trophy)), trophy).toBe(true);
    }
    expect(sim.world.map.height).toBe(160);
  });
});
