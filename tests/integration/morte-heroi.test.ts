// Vida depois da morte dos heróis: recomeçar com o dinheiro do banco, arma primeiro na caveira vermelha, recuperar o saco,
// repor poções antes de ficar seco e as magias de criar poção.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { validateCast } from '../../src/domain/rules/spells';
import { castSpell } from '../../src/game/abilities/spells';
import { damagePlayer } from '../../src/game/combat/combat';
import type { HeroEntity } from '../../src/game/entities/types';
import { asActor } from '../../src/game/simulation/World';
import { advance, makeSim, runUntil } from '../helpers';

function setup(heroId: 'boladex' | 'distanciado' | 'maguim' = 'boladex', level = 14) {
  const sim = makeSim('knight', { seed: 21 });
  const w = sim.world;
  const hero = GAME_DATA.heroes[heroId]!;
  const c = createCharacter(GAME_DATA, {
    id: hero.slotId,
    name: hero.name,
    vocation: hero.vocation,
    now: 0,
    position: w.map.playerStart,
  });
  const h = sim.addHero(hero, c) as HeroEntity;
  void level;
  return { sim, w, h };
}

const killHero = (sim: ReturnType<typeof setup>['sim'], h: HeroEntity) => {
  const w = sim.world;
  asActor(w, h, () => damagePlayer(w, 99999, 'physical', { id: 'x', name: 'Lobo', kind: 'monster' }));
};

describe('morte de caveira vermelha', () => {
  it('perde tudo, renasce sem arma e a primeira compra é uma arma (com o dinheiro do banco)', () => {
    const { sim, w, h } = setup('boladex');
    h.character.bankGold = 3000;
    h.character.level = 12;
    w.social.skulls.set(h.id, { kind: 'red', until: Infinity });
    killHero(sim, h);
    expect(h.dead).toBe(true);
    expect(h.character.equipment.mainHand).toBeUndefined();
    expect(h.character.gold).toBe(0);
    w.lootBags.clear(); // ninguém vai buscar: tem que recomeçar do zero
    // renasce e, sem arma, a primeira parada é a loja de armas
    expect(runUntil(sim, () => !!h.character.equipment.mainHand, 6 * 60000, 50)).toBe(true);
    expect(h.character.bankGold).toBeLessThan(3000);
  });

  it('com a arma na mão de novo, repõe poções e volta a caçar', () => {
    const { sim, w, h } = setup('boladex');
    h.character.bankGold = 3000;
    w.social.skulls.set(h.id, { kind: 'red', until: Infinity });
    killHero(sim, h);
    w.lootBags.clear();
    expect(
      runUntil(
        sim,
        () => !h.dead && h.brain.mode === 'hunt' && !!h.character.equipment.mainHand,
        8 * 60000,
        50,
      ),
    ).toBe(true);
    const potions = Object.values(GAME_DATA.items)
      .filter((i) => i.type === 'potion' && i.use?.heal)
      .reduce((s, i) => s + countItem(h.character.inventory, i.id), 0);
    expect(potions).toBeGreaterThan(0);
  });

  it('sem arma, as magias que pedem arco valem do mesmo jeito', () => {
    const ctx = {
      vocation: 'paladin',
      level: 20,
      magicLevel: 5,
      mana: 200,
      dead: false,
      cooldownRemaining: 0,
      globalCooldownRemaining: 0,
      inProtectionZone: false,
      target: { exists: true, alive: true, hostile: true, distance: 4, lineOfSight: true },
      weaponKind: 'melee',
    } as const;
    const rain = GAME_DATA.spells.arrow_rain!;
    expect(validateCast(rain, ctx).ok).toBe(false);
    expect(validateCast(rain, { ...ctx, unarmed: true }).ok).toBe(true);
  });
});

describe('saco de morte', () => {
  it('o herói volta ao local da morte para pegar o que caiu quando a área é segura', () => {
    const { sim, w, h } = setup('boladex');
    for (const m of w.monsters.values()) {
      m.alive = false;
      m.respawnAt = Infinity;
    }
    h.character.inventory[0] = { itemId: 'potion_health', count: 7 };
    const sp = w.map.spawns.find((q) => q.monsterId === 'slime')!;
    h.x = sp.x;
    h.y = sp.y;
    killHero(sim, h);
    const bag = [...w.lootBags.values()].find((l) => l.ownerId === h.id);
    expect(bag).toBeDefined();
    expect(
      runUntil(sim, () => ![...w.lootBags.values()].some((l) => l.ownerId === h.id), 6 * 60000, 50),
    ).toBe(true);
    expect(countItem(h.character.inventory, 'potion_health')).toBeGreaterThanOrEqual(7);
  });
});

describe('poções acabando', () => {
  it('com 2 poções e dinheiro no banco, avisa, vai à vila e volta com estoque', () => {
    const { sim, h } = setup('boladex');
    h.character.bankGold = 2000;
    h.character.level = 10;
    h.character.inventory[0] = { itemId: 'potion_health', count: 2 };
    h.brain.nextThinkAt = 0;
    const seen: string[] = [];
    sim.events.on('speech', (e) => e.entityId === h.id && seen.push(e.text));
    let wentTown = false;
    runUntil(
      sim,
      () => {
        if (h.brain.mode === 'town') wentTown = true;
        return wentTown && h.brain.mode === 'hunt';
      },
      6 * 60000,
      50,
    );
    expect(wentTown).toBe(true);
    const potions =
      countItem(h.character.inventory, 'potion_health') +
      countItem(h.character.inventory, 'potion_health_great');
    expect(potions).toBeGreaterThan(2);
    advance(sim, 100);
  });
});

describe('magias de criar poção', () => {
  it('Sorcerer cria Poção de Mana Forte por 4x a mana que ela recupera (e Druid a de Vida Forte)', () => {
    for (const [voc, spell, item, cost] of [
      ['sorcerer', 'conjure_mana', 'potion_mana_great', 140 * 4],
      ['druid', 'conjure_health', 'potion_health_great', 160 * 4],
    ] as const) {
      const sim = makeSim(voc, { seed: 3 });
      const w = sim.world;
      const c = w.player.character;
      c.level = 40;
      c.skills.magic.level = 30;
      sim.update(16);
      w.player.stats.maxMana = 2000;
      w.player.stats.magicLevel = 30;
      c.mana = 2000;
      expect(GAME_DATA.spells[spell]!.manaCost).toBe(cost);
      expect(castSpell(w, spell)).toBe(true);
      expect(countItem(c.inventory, item)).toBe(1);
      expect(c.mana).toBe(2000 - cost);
    }
  });

  it('mochila cheia: não gasta a mana', () => {
    const sim = makeSim('sorcerer', { seed: 3 });
    const w = sim.world;
    const c = w.player.character;
    c.level = 40;
    c.skills.magic.level = 30;
    sim.update(16);
    w.player.stats.magicLevel = 30;
    c.mana = 2000;
    for (let i = 0; i < c.inventory.length; i++) c.inventory[i] = { itemId: 'sword_iron', count: 1 };
    expect(castSpell(w, 'conjure_mana')).toBe(false);
    expect(c.mana).toBe(2000);
  });
});

describe('delays fechados e Cura Intensa', () => {
  it('todas as magias e poções usam recargas de 2, 4, 6 ou 8 s (as magias de buff longo também)', () => {
    const allowed = new Set([2000, 4000, 6000, 8000]);
    for (const s of Object.values(GAME_DATA.spells))
      expect(allowed.has(s.cooldownMs), `${s.id} ${s.cooldownMs}`).toBe(true);
    for (const i of Object.values(GAME_DATA.items))
      if (i.type === 'potion')
        expect(allowed.has(i.use!.cooldownMs), `${i.id} ${i.use!.cooldownMs}`).toBe(true);
    const cura = GAME_DATA.spells.sap_blessing!;
    expect(cura.name).toBe('Cura Intensa');
    expect(cura.manaCost).toBe(80);
    expect(cura.partyRadius).toBe(12);
    expect(cura.buff).toBeUndefined();
    expect(GAME_DATA.spells.frost_burst!.cooldownMs).toBe(2000);
  });
});

describe('saco de morte sem trava e mana na PZ', () => {
  it('qualquer um pega o saco de morte na hora', () => {
    const { sim, w, h } = setup('boladex');
    h.character.gold = 500;
    killHero(sim, h);
    const bag = [...w.lootBags.values()].find((l) => l.ownerId === h.id)!;
    expect(bag.gold).toBe(500);
    w.human.x = bag.x;
    w.human.y = bag.y;
    const before = w.human.character.gold;
    w.ui.lootId = bag.id;
    sim.takeLoot('all');
    expect(w.human.character.gold).toBe(before + 500);
  });

  it('o próprio saco de morte não é dividido com o grupo; o de outro personagem é', () => {
    const { sim, w, h } = setup('boladex');
    const p = w.human;
    w.social.party = { leaderId: p.id, members: [p.id, h.id], formation: 'free', targeting: 'nearest', friendlyFire: false, trail: [] };
    h.x = p.x;
    h.y = p.y;
    // saco do próprio jogador: fica tudo com ele
    w.lootBags.set('own', { id: 'own', ownerId: p.id, x: p.x, y: p.y, items: [], gold: 400, expiresAt: Infinity, sourceName: 'eu (morto)' });
    w.ui.lootId = 'own';
    const g0 = p.character.gold;
    const hg0 = h.character.gold;
    sim.takeLoot('all');
    expect(p.character.gold).toBe(g0 + 400);
    expect(h.character.gold).toBe(hg0);
    // saco de morte de um estranho: dividido como loot comum
    w.lootBags.set('other', { id: 'other', ownerId: 'outro', x: p.x, y: p.y, items: [], gold: 400, expiresAt: Infinity, sourceName: 'outro (morto)' });
    w.ui.lootId = 'other';
    sim.takeLoot('all');
    expect(h.character.gold).toBe(hg0 + 200);
  });

  it('a PZ não recupera mana e a bênção do sacerdote só cura vida', () => {
    const sim = makeSim('sorcerer', { seed: 3 });
    const w = sim.world;
    const p = w.player;
    sim.update(16);
    p.character.mana = 10;
    p.character.health = 10;
    advance(sim, 8000, 50);
    expect(p.character.mana).toBe(10);
    expect(p.character.health).toBeGreaterThan(10);
  });
});
