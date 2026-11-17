import { RINGS, SECTORS, TOWN_CX, TOWN_CY, ringOf, sectorAt, townDistance } from '../../src/data/maps/layout';
// Expansão: equipamentos até o nível 100, criaturas tardias, vilas novas, portais e heróis viajando.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { GEAR_KINDS, GEAR_TIERS } from '../../src/data/gearTiers';
import { CREATURE_LADDER } from '../../src/data/monsters';
import { makeSim } from '../helpers';
import manifest from '../../src/assets/generated/manifest.json';
import icons from '../../src/assets/generated/icons.json';

describe('equipamentos do nível 24 ao 100', () => {
  it('cada faixa tem todas as peças e o poder cresce de uma faixa para a próxima', () => {
    let lastAttack = 0;
    let lastArmor = 0;
    for (const t of GEAR_TIERS) {
      for (const kind of GEAR_KINDS)
        expect(GAME_DATA.items[`${kind}_${t.id}`], `${kind}_${t.id}`).toBeDefined();
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
    for (const i of Object.values(GAME_DATA.items))
      expect(frames[i.icon], `${i.id} → ${i.icon}`).toBeDefined();
  });
});

describe('criaturas tardias', () => {
  it('a escada vai até o nível 100, cada espécie tem sprite, loot válido e área no mapa', () => {
    const sim = makeSim('knight');
    const onMap = new Set(sim.world.map.spawns.map((s) => s.monsterId));
    const sheets = new Set(Object.keys(manifest.sheets));
    const late = CREATURE_LADDER.filter((r) => r.tier >= 6);
    expect(late.length).toBe(24); // 16 tardias + 4 das Terras do Sul + o Colosso de Gelo + Serpe Rubra, Lobo Glacial e Ceifador
    expect(Math.max(...Object.values(GAME_DATA.monsters).map((m) => m.level ?? 0))).toBeGreaterThanOrEqual(
      100,
    );
    for (const r of late) {
      const m = GAME_DATA.monsters[r.id]!;
      expect(sheets.has(m.sprite), `${r.id} sprite`).toBe(true);
      expect(onMap.has(r.id), `${r.id} no mapa`).toBe(true);
      for (const l of m.loot) expect(GAME_DATA.items[l.itemId], `${r.id} loot ${l.itemId}`).toBeDefined();
    }
  });

  it('XP e vida crescem de faixa em faixa (sem buracos nem saltos absurdos)', () => {
    const byTier = new Map<number, { xp: number; hp: number }>();
    for (const r of CREATURE_LADDER)
      if (r.step === 0)
        byTier.set(r.tier, {
          xp: GAME_DATA.monsters[r.id]!.experience,
          hp: GAME_DATA.monsters[r.id]!.health,
        });
    const tiers = [...byTier.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]![1].hp).toBeGreaterThan(tiers[i - 1]![1].hp);
      expect(tiers[i]![1].xp).toBeGreaterThan(tiers[i - 1]![1].xp * 0.8);
    }
  });
});

describe('uma cidade só: equipamento do nível 100 em Pedraluz e zonas por distância', () => {
  it('as lojas de Pedraluz vendem todas as faixas e compram os troféus', () => {
    expect(GAME_DATA.shops.equipment!.sells.some((o) => o.itemId === 'sword_primordial')).toBe(true);
    expect(GAME_DATA.shops.equipment!.sells.some((o) => o.itemId === 'bow_celestial')).toBe(true);
    expect(GAME_DATA.shops.potions!.sells.some((o) => o.itemId === 'wand_primordial')).toBe(true);
    expect(GAME_DATA.shops.potions!.sells.some((o) => o.itemId === 'potion_health_divine')).toBe(true);
    expect(GAME_DATA.shops.general!.buys.find((o) => o.itemId === 'dire_fang')?.price).toBe(
      GAME_DATA.items.dire_fang!.value,
    );
    expect(Object.keys(GAME_DATA.shops)).toEqual(['equipment', 'potions', 'general']);
  });

  it('Pedraluz no centro: em qualquer direção, quanto mais longe da muralha, mais forte a criatura (anel a anel)', () => {
    const w = makeSim('knight').world;
    // a vila fica no meio do mundo
    expect(Math.abs(TOWN_CX - w.map.width / 2)).toBeLessThan(6);
    expect(Math.abs(TOWN_CY - w.map.height / 2)).toBeLessThan(6);
    for (const s of SECTORS) {
      const byRing: number[][] = RINGS.map(() => []);
      for (const sp of w.map.spawns) {
        if (sectorAt(sp.x, sp.y) !== s) continue;
        byRing[ringOf(townDistance(sp.x, sp.y).d)]!.push(GAME_DATA.monsters[sp.monsterId]!.level ?? 0);
      }
      const avg = byRing.map((ls) => ls.reduce((a, b) => a + b, 0) / Math.max(1, ls.length));
      // cada direção tem criaturas nos cinco anéis, e a média sobe a cada anel
      for (const [r, ls] of byRing.entries()) expect(ls.length, `${s} anel ${r + 1}`).toBeGreaterThan(0);
      for (let r = 1; r < avg.length; r++) expect(avg[r]!, `${s} anel ${r + 1}`).toBeGreaterThan(avg[r - 1]! + 5);
      expect(Math.max(...byRing[0]!), `${s} anel 1`).toBeLessThanOrEqual(8);
      expect(Math.min(...byRing[4]!), `${s} anel 5`).toBeGreaterThanOrEqual(76);
    }
  });
});
