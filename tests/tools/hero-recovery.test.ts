// Ferramenta: recuperação depois de perder tudo (morte de caveira vermelha). Os quatro heróis no nível HERO_LEVEL
// (padrão 35), sem equipamento, mochila nem bolsa, com HERO_BANK de ouro no banco. A cada minuto mostra o modo, a arma,
// quantas peças equipadas, poções, a caça (e o nível da criatura) e no fim o nível, as mortes e a XP ganha.
//   RPGZIM_TOOLS=1 HERO_MINUTES=30 HERO_LEVEL=35 HERO_BANK=8000 npx vitest run tests/tools/hero-recovery.test.ts
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { totalXpForLevel } from '../../src/domain/rules/experience';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('recuperação depois de perder tudo', { timeout: 900_000 }, () => {
  const minutes = Number(process.env.HERO_MINUTES ?? 30);
  const level = Number(process.env.HERO_LEVEL ?? 35);
  const bank = Number(process.env.HERO_BANK ?? 8000);
  const sim = makeSim('druid', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  const heroes = Object.values(GAME_DATA.heroes).map((def) => {
    const c = createCharacter(GAME_DATA, {
      id: def.slotId,
      name: def.name,
      vocation: def.vocation,
      now: 0,
      position: w.map.playerStart,
    });
    c.level = level;
    c.experience = totalXpForLevel(level, w.data.balance.experience);
    for (const k of ['sword', 'club', 'axe', 'distance', 'shielding'] as const)
      if (c.skills[k]) c.skills[k].level = Math.round(level * 1.1);
    c.skills.magic.level = Math.round(level / 3);
    // perdeu tudo: nada equipado, mochila e bolsa vazias; só o banco
    c.equipment = {};
    c.inventory.fill(null);
    c.gold = 0;
    c.bankGold = bank;
    const h = sim.addHero(def, c) as HeroEntity;
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    return h;
  });
  const deaths: Record<string, number> = {};
  for (const h of heroes) h.scope.events.on('playerDied', () => (deaths[h.id] = (deaths[h.id] ?? 0) + 1));
  const xp0 = new Map(heroes.map((h) => [h.id, h.character.experience]));
  const log: string[] = [];
  for (let s = 1; s <= minutes * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    if (s % 60) continue;
    for (const h of heroes) {
      const c = h.character;
      const eq = Object.values(c.equipment).filter(Boolean).length;
      const pots = c.inventory.reduce((n, st) => n + (st && st.itemId.startsWith('potion') ? st.count : 0), 0);
      const m = w.data.monsters[h.brain.quarry ?? ''];
      log.push(
        `${String(s / 60).padStart(2)}m ${c.name.padEnd(12)} nv ${c.level} ${h.brain.mode.padEnd(7)} arma ${c.equipment.mainHand?.itemId ?? '—'} peças ${eq} poções ${pots} ouro ${c.gold}+${c.bankGold} caça ${h.brain.quarry ?? '—'}${m ? ` (nv ${m.level})` : ''}${h.brain.mode === 'town' ? ` [${h.brain.townWhy}]` : ''}`,
      );
    }
  }
  const summary = heroes.map(
    (h) =>
      `${h.character.name}: nível ${level} → ${h.character.level}, XP +${h.character.experience - xp0.get(h.id)!}, mortes ${deaths[h.id] ?? 0}, peças ${Object.values(h.character.equipment).filter(Boolean).length}`,
  );
  process.stderr.write(`${log.join('\n')}\n\nRESUMO\n${summary.join('\n')}\n`);
});
