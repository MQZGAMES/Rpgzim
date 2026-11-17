// Ferramenta: uso de magias de ataque na caça. Os quatro heróis no nível HERO_LEVEL (padrão 30), equipados pela IA com
// HERO_BANK de ouro, caçam por HERO_MINUTES (em grupo se HERO_GROUP=1). Mostra, por herói: ataques básicos, magias de
// ataque (área x alvo único), fração do tempo lutando em que havia 2+ criaturas perto, mana média em luta e poções de
// mana bebidas.
//   RPGZIM_TOOLS=1 HERO_MINUTES=20 HERO_LEVEL=30 HERO_GROUP=1 npx vitest run tests/tools/hero-spells.test.ts
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { totalXpForLevel } from '../../src/domain/rules/experience';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('magias na caça', { timeout: 900_000 }, () => {
  const minutes = Number(process.env.HERO_MINUTES ?? 20);
  const level = Number(process.env.HERO_LEVEL ?? 30);
  const group = process.env.HERO_GROUP === '1';
  const sim = makeSim('druid', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  const heroes = Object.values(GAME_DATA.heroes).map((def) => {
    const c = createCharacter(GAME_DATA, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
    c.level = level;
    c.experience = totalXpForLevel(level, w.data.balance.experience);
    for (const k of ['sword', 'club', 'axe', 'distance', 'shielding'] as const) if (c.skills[k]) c.skills[k].level = Math.round(level * 1.1);
    c.skills.magic.level = c.vocation === 'sorcerer' || c.vocation === 'druid' ? Math.round(level * 0.8) : Math.round(level / 3);
    c.bankGold = Number(process.env.HERO_BANK ?? 20000);
    const h = sim.addHero(def, c) as HeroEntity;
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    h.character.mana = h.stats.maxMana;
    return h;
  });
  if (group) {
    // os quatro num grupo de heróis desde o começo, liderado pelo Knight
    const lead = heroes.find((h) => h.character.vocation === 'knight') ?? heroes[0]!;
    w.social.heroParties.push({
      leaderId: lead.id,
      members: heroes.map((h) => h.id),
      formation: 'free',
      targeting: 'nearest',
      friendlyFire: false,
      trail: [],
    });
  }
  type Stat = { basic: number; aoe: number; single: number; other: number; manaPots: number; fightS: number; crowdS: number; manaSum: number; spells: Record<string, number> };
  const st = new Map<string, Stat>(heroes.map((h) => [h.id, { basic: 0, aoe: 0, single: 0, other: 0, manaPots: 0, fightS: 0, crowdS: 0, manaSum: 0, spells: {} }]));
  let deaths = 0;
  // abates por espécie (nível) e XP ganha: mostra onde eles caçam (sozinhos x em grupo) e quanto rende
  const kills: Record<string, number> = {};
  const xp0 = heroes.reduce((s, h) => s + h.character.experience, 0);
  sim.events.on('entityDied', (e) => {
    if (e.kind !== 'monster') return;
    const def = w.monsters.get(e.entityId)?.def;
    if (def) kills[`${def.id}(${def.level})`] = (kills[`${def.id}(${def.level})`] ?? 0) + 1;
  });
  let lowS = 0;
  let below70 = 0;
  let coveredS = 0;
  let healCasts = 0;
  let druidHeals = 0;
  for (const h of heroes) {
    h.scope.events.on('playerDied', () => deaths++);
    h.scope.events.on('spellCast', (e) => {
      if (e.casterId !== h.id || w.data.spells[e.spellId]?.effect !== 'heal') return;
      healCasts++;
      if (h.character.vocation === 'druid') druidHeals++;
    });
  }
  for (const h of heroes) {
    const s = st.get(h.id)!;
    h.scope.events.on('attack', (e) => e.sourceId === h.id && s.basic++);
    h.scope.events.on('spellCast', (e) => {
      if (e.casterId !== h.id) return;
      const sp = w.data.spells[e.spellId];
      if (!sp || sp.effect !== 'damage') return void s.other++;
      if ((sp.radius ?? 0) > 0) s.aoe++;
      else s.single++;
      const base = sp.id;
      s.spells[base] = (s.spells[base] ?? 0) + 1;
    });
    h.scope.events.on('itemUsed', (e) => e.itemId.includes('mana') && s.manaPots++);
  }
  for (let t = 0; t < minutes * 60 * 4; t++) {
    advance(sim, 250, 50);
    w.human.character.health = w.human.stats.maxHealth;
    // só conta quem está no grupo do Druid e ao alcance da cura dele (os heróis formam e desfazem grupos sozinhos)
    const druid = heroes.find((h) => h.character.vocation === 'druid')!;
    const party = w.social.heroParties.find((p) => p.members.includes(druid.id));
    const covered = heroes.filter(
      (h) => !h.dead && !druid.dead && party?.members.includes(h.id) && Math.max(Math.abs(h.x - druid.x), Math.abs(h.y - druid.y)) <= 10,
    );
    if (covered.length >= 2) coveredS += 0.25;
    if (covered.some((h) => h.character.health < h.stats.maxHealth * 0.5)) lowS += 0.25;
    if (covered.some((h) => h.character.health < h.stats.maxHealth * 0.7)) below70 += 0.25;
    for (const h of heroes) {
      if (!h.targetId || !w.monsters.has(h.targetId)) continue;
      const s = st.get(h.id)!;
      s.fightS += 0.25;
      s.manaSum += (h.character.mana / Math.max(1, h.stats.maxMana)) * 0.25;
      const near = [...w.monsters.values()].filter((m) => m.alive && m.targetId && Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y)) <= 5).length;
      if (near >= 2) s.crowdS += 0.25;
    }
  }
  const lines = heroes.map((h) => {
    const s = st.get(h.id)!;
    const top = Object.entries(s.spells).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
    return `${h.character.name.padEnd(12)} nv ${h.character.level} | luta ${Math.round(s.fightS)}s (2+ criaturas ${Math.round((s.crowdS / Math.max(1, s.fightS)) * 100)}%) mana média ${Math.round((s.manaSum / Math.max(1, s.fightS)) * 100)}% | básicos ${s.basic} magias área ${s.aoe} alvo ${s.single} (${((s.aoe + s.single) / Math.max(1, s.fightS / 60)).toFixed(1)}/min) | poções de mana ${s.manaPots} | ${top}`;
  });
  process.stderr.write(
    `${group ? 'EM GRUPO' : 'SOZINHOS'} ${minutes} min, nível ${level}\n${lines.join('\n')}\n` +
      `GRUPO: mortes ${deaths} | junto do Druid ${Math.round(coveredS)}s, nisso alguém < 50% ${Math.round(lowS)}s e < 70% ${Math.round(below70)}s | curas no grupo ${healCasts} (Druid ${druidHeals})\n` +
      `ABATES: ${Object.entries(kills).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-'} | XP somada ${heroes.reduce((s, h) => s + h.character.experience, 0) - xp0}\n`,
  );
});
