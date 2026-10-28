// Vida em grupo: passar por dentro de outro na PZ, aproveitar a ida do líder à cidade, cura automática e Knight sem poção.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { canEnter, placeOccupant } from '../../src/game/movement/movement';
import type { HeroEntity } from '../../src/game/entities/types';
import { acceptInvite, configureParty, invite } from '../../src/game/social/social';
import { isPz } from '../../src/game/world/GameMap';
import { advance, makeSim } from '../helpers';

function withHero(id = 'boladex', vocation: 'knight' | 'druid' = 'knight') {
  const sim = makeSim(vocation, { seed: 31 });
  const hero = GAME_DATA.heroes[id]!;
  const c = createCharacter(GAME_DATA, {
    id: hero.slotId,
    name: hero.name,
    vocation: hero.vocation,
    now: 0,
    position: sim.world.map.playerStart,
  });
  const h = sim.addHero(hero, c) as HeroEntity;
  return { sim, w: sim.world, h };
}

describe('área protegida', () => {
  it('personagens passam um por dentro do outro na PZ, mas não fora dela', () => {
    const { w, h } = withHero();
    const s = w.map.playerStart;
    expect(isPz(w.map, s.x, s.y)).toBe(true);
    h.x = s.x + 1;
    h.y = s.y;
    placeOccupant(w, h);
    expect(canEnter(w, h.x, h.y, false, w.human.id)).toBe(true);
    // fora da PZ o tile ocupado continua barrado
    let out: { x: number; y: number } | null = null;
    for (let dx = 8; dx < 60 && !out; dx++)
      if (!isPz(w.map, s.x + dx, s.y) && canEnter(w, s.x + dx, s.y, false, h.id))
        out = { x: s.x + dx, y: s.y };
    expect(out).not.toBeNull();
    h.x = out!.x;
    h.y = out!.y;
    placeOccupant(w, h);
    expect(canEnter(w, h.x, h.y, false, w.human.id)).toBe(false);
  });
});

describe('cura automática', () => {
  it('o Druida usa a Bênção da Seiva quando um aliado do grupo cai abaixo do limite', () => {
    const { sim, w, h } = withHero('boladex', 'druid');
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    w.human.character.level = 10;
    w.human.stats.magicLevel = 5;
    w.human.character.mana = 500;
    w.human.stats.maxMana = 500;
    h.x = w.human.x + 1;
    h.y = w.human.y;
    h.character.inventory.fill(null);
    w.auto.autoHeal = true;
    w.auto.healGroup = true;
    w.auto.groupBelow = 0.5;
    sim.update(16);
    w.human.stats.magicLevel = 5;
    w.human.character.mana = 500;
    h.character.health = Math.round(h.stats.maxHealth * 0.3);
    const before = h.character.health;
    advance(sim, 600, 50); // o próprio passo da simulação roda a cura automática
    expect(w.human.cooldowns['spell:sap_blessing'] ?? 0).toBeGreaterThan(0);
    expect(h.character.health).toBeGreaterThan(before);
  });

  it('Knight cura a si mesmo com Respiro Vital; sem a opção ligada não cura', () => {
    const { sim, w } = withHero('boladex', 'knight');
    const p = w.human;
    p.character.mana = 100;
    p.stats.maxMana = 100;
    p.character.health = Math.round(p.stats.maxHealth * 0.3);
    advance(sim, 600, 50);
    expect(p.cooldowns['spell:light_heal'] ?? 0).toBe(0);
    p.character.health = Math.round(p.stats.maxHealth * 0.3);
    p.character.mana = 100;
    w.auto.autoHeal = true;
    w.auto.spellHeal = true;
    w.auto.healBelow = 0.6;
    advance(sim, 600, 50);
    expect(p.cooldowns['spell:light_heal'] ?? 0).toBeGreaterThan(0);
  });
});

describe('líder na cidade', () => {
  it('o herói membro aproveita a ida do líder (jogador) à cidade para vender o loot e repor poções', () => {
    const { sim, w, h } = withHero();
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    configureParty(w, w.human.id, { formation: 'follow' });
    sim.teleportPlayer(w.map.playerStart.x, w.map.playerStart.y);
    h.character.bankGold = 800;
    h.character.inventory[0] = { itemId: 'goblin_ear', count: 12 };
    h.brain.mode = 'follow';
    h.brain.nextThinkAt = 0;
    h.brain.nextTownAt = 0;
    let town = false;
    for (let t = 0; t < 20000 && !town; t += 100) {
      advance(sim, 100, 50);
      town = (h.brain.mode as string) === 'town';
    }
    expect(town).toBe(true);
  });
});

describe('Knight sem poção', () => {
  it('não lura nem puxa criaturas com pouca poção; com estoque, sim', async () => {
    const { w, h } = withHero();
    const { heroHelpers } = await import('../../src/game/ai/heroBrain');
    h.character.inventory.fill(null);
    expect(heroHelpers.wellStocked(w, h)).toBe(false);
    h.character.inventory[0] = { itemId: 'potion_health', count: 40 };
    expect(heroHelpers.wellStocked(w, h)).toBe(true);
  });
});

describe('saco de morte do jogador', () => {
  it('os heróis não pegam o saco de morte do jogador nem o que ele jogou no chão, e o saco não é dividido com o grupo', () => {
    const { sim, w, h } = withHero();
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    for (const m of w.monsters.values()) {
      m.alive = false;
      m.respawnAt = Infinity;
    }
    const s = w.map.playerStart;
    h.x = s.x + 2;
    h.y = s.y + 1;
    w.lootBags.set('loot:morte', {
      id: 'loot:morte',
      ownerId: w.human.id,
      x: s.x + 2,
      y: s.y + 1,
      items: [{ itemId: 'sword_iron', count: 1 }],
      gold: 500,
      expiresAt: Infinity,
      sourceName: 'Teste (morto)',
    });
    w.lootBags.set('loot:chao', {
      id: 'loot:chao',
      x: s.x + 2,
      y: s.y + 2,
      items: [{ itemId: 'dagger', count: 1 }],
      gold: 0,
      expiresAt: Infinity,
      sourceName: 'Item no chão',
      dropped: true,
    });
    h.brain.mode = 'hunt';
    h.brain.nextThinkAt = 0;
    const gold = h.character.gold;
    advance(sim, 5000, 50);
    expect(w.lootBags.get('loot:morte')?.gold).toBe(500);
    expect(w.lootBags.has('loot:chao')).toBe(true);
    expect(h.character.gold).toBe(gold);
  });
});

describe('migração das ajudas automáticas', () => {
  it('configurações antigas viram a caixa Cura automática com as opções certas', async () => {
    const { migrateAuto } = await import('../../src/game/ai/autoPlay');
    const m = migrateAuto({ autoPotion: true, autoHeal: false, hpBelow: 0.5, manaBelow: 0.3 });
    expect(m.autoHeal).toBe(true);
    expect(m.potionHp).toBe(true);
    expect(m.potionMana).toBe(true);
    expect(m.spellHeal).toBe(false);
    expect(migrateAuto({ autoLoot: true })).toEqual({ autoLoot: true });
  });
});

describe('herói cercado longe do líder', () => {
  it('seguindo o líder e cercado por criaturas, ele luta (não fica parado bebendo poção até morrer)', () => {
    const { sim, w, h } = withHero();
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    configureParty(w, w.human.id, { formation: 'follow' });
    for (const m of w.monsters.values()) {
      m.alive = false;
      m.respawnAt = Infinity;
    }
    // campo aberto a mais de 8 tiles do líder
    const s = w.map.playerStart;
    let spot = { x: s.x + 40, y: s.y };
    for (let dx = 20; dx < 80; dx++)
      if (
        !isPz(w.map, s.x + dx, s.y) &&
        canEnter(w, s.x + dx, s.y, false, h.id) &&
        canEnter(w, s.x + dx + 1, s.y, false) &&
        canEnter(w, s.x + dx, s.y + 1, false)
      ) {
        spot = { x: s.x + dx, y: s.y };
        break;
      }
    h.x = spot.x;
    h.y = spot.y;
    h.brain.mode = 'follow';
    h.brain.nextThinkAt = 0;
    h.character.inventory[0] = { itemId: 'potion_health', count: 30 };
    const mons = [...w.monsters.values()].slice(0, 3);
    mons.forEach((m, i) => {
      m.def = GAME_DATA.monsters.slime!;
      m.hp = m.def.health * 4;
      m.alive = true;
      m.state = 'attacking';
      m.targetId = h.id;
      m.x = spot.x + (i === 0 ? 1 : 0);
      m.y = spot.y + (i === 2 ? 1 : i === 1 ? 0 : 0);
      if (i === 1) m.x = spot.x - 1;
      if (i === 2) m.x = spot.x;
    });
    let fought = false;
    for (let t = 0; t < 4000 && !fought; t += 100) {
      advance(sim, 100, 50);
      fought = !!h.targetId && w.monsters.get(h.targetId)?.alive === true;
    }
    expect(fought).toBe(true);
  });
});
