// Expansão: equipamentos até o nível 100, criaturas tardias, vilas novas, portais e heróis viajando.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { GEAR_KINDS, GEAR_TIERS } from '../../src/data/gearTiers';
import { CREATURE_LADDER } from '../../src/data/monsters';
import { createCharacter } from '../../src/domain/rules/character';
import { chooseDialogOption, interactWith } from '../../src/game/interaction/interaction';
import type { HeroEntity } from '../../src/game/entities/types';
import { advance, makeSim } from '../helpers';
import manifest from '../../src/assets/generated/manifest.json';
import icons from '../../src/assets/generated/icons.json';

describe('equipamentos do nível 24 ao 100', () => {
  it('cada faixa tem todas as peças e o poder cresce de uma faixa para a próxima', () => {
    let lastAttack = 0;
    let lastArmor = 0;
    for (const t of GEAR_TIERS) {
      for (const kind of GEAR_KINDS) expect(GAME_DATA.items[`${kind}_${t.id}`], `${kind}_${t.id}`).toBeDefined();
      const sword = GAME_DATA.items[`sword_${t.id}`]!;
      const armor = GAME_DATA.items[`armor_${t.id}`]!;
      expect(sword.minLevel).toBe(t.level);
      expect(sword.weapon!.attack).toBeGreaterThan(lastAttack);
      expect(armor.armor!).toBeGreaterThan(lastArmor);
      lastAttack = sword.weapon!.attack;
      lastArmor = armor.armor!;
    }
    expect(GEAR_TIERS.at(-1)!.level).toBe(100);
  });

  it('todos os itens novos têm ícone no atlas', () => {
    const frames = icons.frames as Record<string, unknown>;
    for (const i of Object.values(GAME_DATA.items)) expect(frames[i.icon], `${i.id} → ${i.icon}`).toBeDefined();
  });
});

describe('criaturas tardias', () => {
  it('a escada vai até o nível 100, cada espécie tem sprite, loot válido e área no mapa', () => {
    const sim = makeSim('knight');
    const onMap = new Set(sim.world.map.spawns.map((s) => s.monsterId));
    const sheets = new Set(Object.keys(manifest.sheets));
    const late = CREATURE_LADDER.filter((r) => r.tier >= 6);
    expect(late.length).toBe(16);
    expect(Math.max(...Object.values(GAME_DATA.monsters).map((m) => m.level ?? 0))).toBeGreaterThanOrEqual(100);
    for (const r of late) {
      const m = GAME_DATA.monsters[r.id]!;
      expect(sheets.has(m.sprite), `${r.id} sprite`).toBe(true);
      expect(onMap.has(r.id), `${r.id} no mapa`).toBe(true);
      for (const l of m.loot) expect(GAME_DATA.items[l.itemId], `${r.id} loot ${l.itemId}`).toBeDefined();
    }
  });

  it('XP e vida crescem de faixa em faixa (sem buracos nem saltos absurdos)', () => {
    const byTier = new Map<number, { xp: number; hp: number }>();
    for (const r of CREATURE_LADDER) if (r.step === 0) byTier.set(r.tier, { xp: GAME_DATA.monsters[r.id]!.experience, hp: GAME_DATA.monsters[r.id]!.health });
    const tiers = [...byTier.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]![1].hp).toBeGreaterThan(tiers[i - 1]![1].hp);
      expect(tiers[i]![1].xp).toBeGreaterThan(tiers[i - 1]![1].xp * 0.8);
    }
  });
});

describe('vilas novas e portais', () => {
  const portal = (w: ReturnType<typeof makeSim>['world'], id: string) => [...w.npcs.values()].find((n) => n.def.id === id)!;

  it('as vilas têm lojas, banco, sacerdote e portal; as lojas vendem a faixa certa', () => {
    const w = makeSim('knight').world;
    for (const p of ['e', 'f'])
      for (const k of ['priest', 'smith', 'arcana', 'alchemist', 'banker', 'portal']) expect(portal(w, `${p}_${k}`), `${p}_${k}`).toBeDefined();
    expect(GAME_DATA.shops.e_smith!.sells.some((o) => o.itemId === 'sword_obsidian')).toBe(true);
    expect(GAME_DATA.shops.e_smith!.sells.some((o) => o.itemId === 'sword_primordial')).toBe(false);
    expect(GAME_DATA.shops.f_smith!.sells.some((o) => o.itemId === 'sword_primordial')).toBe(true);
    expect(GAME_DATA.shops.f_alchemy!.sells.some((o) => o.itemId === 'potion_health_divine')).toBe(true);
    // troféus são comprados pelo valor cheio
    expect(GAME_DATA.shops.e_alchemy!.buys.find((o) => o.itemId === 'dire_fang')?.price).toBe(GAME_DATA.items.dire_fang!.value);
  });

  it('o portal leva ao Forte Esperança: exige nível e ouro; a volta é de graça', () => {
    const sim = makeSim('knight', { seed: 9 });
    const w = sim.world;
    const p = w.player;
    const from = portal(w, 'p_portal');
    p.character.level = 10;
    p.character.gold = 1000;
    const open = (npc: typeof from) => {
      w.ui.dialog = { npcId: npc.id, pageId: 'start' };
    };
    open(from);
    chooseDialogOption(w, 0); // Forte Esperança (nível 24+)
    expect(p.x).toBeLessThan(100); // nível baixo: não foi
    p.character.level = 30;
    p.character.gold = 100;
    open(from);
    chooseDialogOption(w, 0);
    expect(p.x).toBeLessThan(100); // sem ouro: não foi
    p.character.gold = 1000;
    open(from);
    chooseDialogOption(w, 0);
    expect(p.x).toBeGreaterThan(170);
    expect(p.character.gold).toBe(700);
    // volta grátis
    const back = portal(w, 'e_portal');
    open(back);
    chooseDialogOption(w, 0); // Pedraluz
    expect(p.x).toBeLessThan(100);
    expect(p.character.gold).toBe(700);
    void interactWith;
  });

  it('um herói com nível e ouro atravessa o portal sozinho para comprar equipamento no Forte', () => {
    const sim = makeSim('knight', { seed: 12 });
    const w = sim.world;
    const hero = GAME_DATA.heroes.boladex!;
    const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart });
    const h = sim.addHero(hero, c) as HeroEntity;
    c.level = 30;
    c.gold = 6000;
    c.bankGold = 20000;
    let reached = false;
    for (let s = 0; s < 6 * 60 && !reached; s++) {
      advance(sim, 1000, 50);
      w.human.character.health = w.human.stats.maxHealth;
      reached = h.x > 170;
    }
    expect(reached).toBe(true);
  }, 60_000);
});
