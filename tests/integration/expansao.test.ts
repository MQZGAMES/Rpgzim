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

describe('uma cidade só: equipamento do nível 100 em Pedraluz e zonas por distância', () => {
  it('as lojas de Pedraluz vendem todas as faixas e compram os troféus', () => {
    expect(GAME_DATA.shops.equipment!.sells.some((o) => o.itemId === 'sword_primordial')).toBe(true);
    expect(GAME_DATA.shops.equipment!.sells.some((o) => o.itemId === 'bow_celestial')).toBe(true);
    expect(GAME_DATA.shops.potions!.sells.some((o) => o.itemId === 'wand_primordial')).toBe(true);
    expect(GAME_DATA.shops.potions!.sells.some((o) => o.itemId === 'potion_health_divine')).toBe(true);
    expect(GAME_DATA.shops.general!.buys.find((o) => o.itemId === 'dire_fang')?.price).toBe(GAME_DATA.items.dire_fang!.value);
    expect(Object.keys(GAME_DATA.shops)).toEqual(['equipment', 'potions', 'general']);
  });

  it('quanto mais longe de Pedraluz, mais difícil: o nível da criatura sobe com a distância (por zona)', () => {
    const w = makeSim('knight').world;
    const home = w.map.playerStart;
    const levelAt = new Map<string, { dist: number; level: number }[]>();
    for (const s of w.map.spawns) {
      const m = GAME_DATA.monsters[s.monsterId]!;
      if ((m.level ?? 0) < 44) continue;
      const arr = levelAt.get(m.id) ?? [];
      arr.push({ dist: Math.hypot(s.x - home.x, s.y - home.y), level: m.level! });
      levelAt.set(m.id, arr);
    }
    const rows = [...levelAt.entries()].map(([id, a]) => ({ id, d: a.reduce((s, x) => s + x.dist, 0) / a.length, level: a[0]!.level })).sort((a, b) => a.d - b.d);
    const avg = (xs: typeof rows) => xs.reduce((s, r) => s + r.level, 0) / xs.length;
    const half = rows.length / 2;
    expect(avg(rows.slice(half))).toBeGreaterThan(avg(rows.slice(0, half)) + 25); // a metade mais longe é bem mais difícil
    expect(rows.slice(0, 4).every((r) => r.level <= 60)).toBe(true);
    expect(rows.slice(-4).every((r) => r.level >= 76)).toBe(true);
  });
});
