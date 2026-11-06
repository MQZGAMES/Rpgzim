// Logar/deslogar personagens com IA, nível mágico por vocação (a cura dos magos), custo de mana que
// sobe com o nível, magias opcionais, poções à venda, criaturas que cercam e a perseguição que não trava.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { customHeroDef } from '../../src/data/heroes';
import { createCharacter } from '../../src/domain/rules/character';
import { defaultHotbar } from '../../src/domain/rules/hotbar';
import { triesForNextLevel } from '../../src/domain/rules/skills';
import { spellManaCost } from '../../src/domain/rules/spells';
import { spellRange } from '../../src/domain/rules/damage';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { placeOccupant, removeOccupant } from '../../src/game/movement/movement';
import { invite, acceptInvite, partyOf } from '../../src/game/social/social';
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
