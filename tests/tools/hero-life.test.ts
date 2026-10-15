// Ferramenta: simula o Boladex sozinho por N minutos e imprime o diário dele (decisões, falas, progresso).
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('vida do Boladex', { timeout: 600_000 }, () => {
  const minutes = Number(process.env.HERO_MINUTES ?? 30);
  const sim = makeSim('druid', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart });
  const h = sim.addHero(hero, c) as HeroEntity;
  const log: string[] = [];
  const t = () => `${String(Math.floor(w.now / 60000)).padStart(2, '0')}:${String(Math.floor((w.now % 60000) / 1000)).padStart(2, '0')}`;
  sim.events.on('speech', (e) => log.push(`${t()} 💬 ${e.text}`));
  sim.events.on('entityDied', (e) => e.entityId === h.id && log.push(`${t()} ☠ morreu (${h.brain.lastHitBy})`));
  sim.events.on('actorFx', (e) => e.tone !== 'xp' && log.push(`${t()} ✨ ${e.text}`));
  let mode = '';
  let kills = 0;
  sim.events.on('entityDied', (e) => e.kind === 'monster' && kills++);
  const t0 = performance.now();
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    sim.world.player.character.health = sim.world.player.stats.maxHealth; // o jogador humano fica parado no templo
    if (h.brain.mode !== mode) {
      mode = h.brain.mode;
      log.push(`${t()} → ${mode}${h.brain.quarry ? ` (${h.brain.quarry})` : ''} hp ${h.character.health}/${h.stats.maxHealth} ouro ${h.character.gold} banco ${h.character.bankGold}`);
    }
  }
  const ch = h.character;
  const eq = Object.values(ch.equipment).map((s) => s!.itemId).join(', ');
  process.stderr.write(log.join('\n') + `\n\nRESUMO ${minutes} min (cpu ${((performance.now() - t0) / 1000).toFixed(1)} s): nível ${ch.level} xp ${ch.experience} | sword ${ch.skills.sword.level} shield ${ch.skills.shielding.level} | ouro ${ch.gold} banco ${ch.bankGold} | kills ${kills} mortes ${ch.stats.deaths}\nequip: ${eq}\nmochila: ${ch.inventory.filter(Boolean).map((s) => `${s!.itemId}x${s!.count}`).join(', ')}\n`);
});

test('diagnóstico de upgrade', { timeout: 600_000 }, async () => {
  if (!process.env.HERO_DIAG) return;
  const { bestUpgrade } = await import('../../src/game/ai/heroBrain');
  const sim = makeSim('druid', { seed: 5 });
  const w = sim.world;
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart });
  const h = sim.addHero(hero, c) as HeroEntity;
  for (let s = 0; s < 50 * 60; s++) advance(sim, 1000, 50);
  const ch = h.character;
  process.stderr.write(`nível ${ch.level} ouro ${ch.gold} banco ${ch.bankGold} modo ${h.brain.mode} passos ${JSON.stringify(h.brain.town)}\n`);
  process.stderr.write(`equip ${JSON.stringify(ch.equipment)}\nmochila ${JSON.stringify(ch.inventory.filter(Boolean))}\n`);
  process.stderr.write(`upgrade(total) ${JSON.stringify(bestUpgrade(w, h, ch.gold + ch.bankGold - 400))} upgrade(bolsa) ${JSON.stringify(bestUpgrade(w, h, ch.gold - 30))}\n`);
});
