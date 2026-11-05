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
  const hero = GAME_DATA.heroes[process.env.HERO_ID ?? 'boladex']!;
  const c = createCharacter(GAME_DATA, {
    id: hero.slotId,
    name: hero.name,
    vocation: hero.vocation,
    now: 0,
    position: w.map.playerStart,
  });
  const h = sim.addHero(hero, c) as HeroEntity;
  const log: string[] = [];
  const t = () =>
    `${String(Math.floor(w.now / 60000)).padStart(2, '0')}:${String(Math.floor((w.now % 60000) / 1000)).padStart(2, '0')}`;
  sim.events.on('speech', (e) => log.push(`${t()} 💬 ${e.text}`));
  sim.events.on(
    'entityDied',
    (e) => e.entityId === h.id && log.push(`${t()} ☠ morreu (${h.brain.lastHitBy})`),
  );
  sim.events.on('actorFx', (e) => e.tone !== 'xp' && log.push(`${t()} ✨ ${e.text}`));
  let mode = '';
  let kills = 0;
  const modeMs: Record<string, number> = {};
  // cenário: jogador humano parado num lugar de passagem (HERO_HUMAN=x,y), como um jogador real faria
  const spot = process.env.HERO_HUMAN?.split(',').map(Number);
  if (spot) sim.teleportPlayer(spot[0]!, spot[1]!);
  sim.events.on('entityDied', (e) => e.kind === 'monster' && kills++);
  // economia: o que ele gasta em poções (pelo preço da loja) e quanto vale o patrimônio (bolsa + banco) a cada 30 min
  const used: Record<string, number> = {};
  h.scope.events.on('itemUsed', (e) => (used[e.itemId] = (used[e.itemId] ?? 0) + 1));
  const shopPrice = (id: string) =>
    Math.min(Infinity, ...Object.values(GAME_DATA.shops).flatMap((sh) => sh.sells.filter((o) => o.itemId === id).map((o) => o.price)));
  const econ: string[] = [];
  let spentSeen = 0;
  let manaDrunk = 0;
  let manaSeen = -Infinity;
  const t0 = performance.now();
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    sim.world.player.character.health = sim.world.player.stats.maxHealth; // o jogador humano fica parado no templo
    modeMs[h.brain.mode] = (modeMs[h.brain.mode] ?? 0) + 1;
    if ((s + 1) % 1800 === 0) {
      const spent = Object.entries(used).reduce((a, [id, n]) => a + (Number.isFinite(shopPrice(id)) ? shopPrice(id) * n : 0), 0);
      econ.push(
        `${t()} nv ${h.character.level} patrimônio ${h.character.gold + h.character.bankGold} poções +${spent - spentSeen} de ouro [${Object.entries(used)
          .map(([k, v]) => `${k.replace('potion_', '')}:${v}`)
          .join(' ')}]`,
      );
      spentSeen = spent;
    }
    for (const e of h.brain.manaLog) if (e.at > manaSeen) manaDrunk++;
    manaSeen = h.brain.manaLog[h.brain.manaLog.length - 1]?.at ?? manaSeen;
    if (h.brain.mode !== mode) {
      mode = h.brain.mode;
      if (mode === 'retreat') log.push(`${t()} ⚠ fuga: ${h.brain.retreatWhy}`);
      const steps =
        mode === 'town'
          ? ` [${h.brain.townWhy}] passos=${h.brain.town.map((st) => (st.kind === 'shop' ? st.npcId.replace('npc:', '') : st.kind === 'bank' ? 'banco:' + st.op : st.kind)).join(',')} livres=${h.character.inventory.filter((x) => !x).length} poções=${h.character.inventory.reduce((a, st) => a + (st?.itemId.startsWith('potion_health') ? st.count : 0), 0)}`
          : '';
      log.push(
        `${t()} → ${mode}${h.brain.quarry ? ` (${h.brain.quarry})` : ''} arma ${h.character.equipment.mainHand?.itemId} flechas ${h.character.inventory.reduce((a, st) => a + (st?.itemId.startsWith('arrow') ? st.count : 0), 0)} mana ${h.character.mana}/${h.stats.maxMana} hp ${h.character.health}/${h.stats.maxHealth} ouro ${h.character.gold} banco ${h.character.bankGold}${steps}`,
      );
    }
  }
  const ch = h.character;
  const eq = Object.values(ch.equipment)
    .map((s) => s!.itemId)
    .join(', ');
  const total = Object.values(modeMs).reduce((a, b) => a + b, 0);
  const dist = Object.entries(modeMs)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`)
    .join(' · ');
  process.stderr.write(
    (process.env.HERO_QUIET ? '' : log.join('\n')) +
      `\n\nECONOMIA\n${econ.join('\n')}\nTEMPO: ${dist}\nRESUMO ${minutes} min (cpu ${((performance.now() - t0) / 1000).toFixed(1)} s): nível ${ch.level} xp ${ch.experience} | sword ${ch.skills.sword.level} shield ${ch.skills.shielding.level} | ouro ${ch.gold} banco ${ch.bankGold} | kills ${kills} mortes ${ch.stats.deaths} | ml ${ch.skills.magic.level} poçõesMana ${manaDrunk}\nequip: ${eq}\nmochila: ${ch.inventory
        .filter(Boolean)
        .map((s) => `${s!.itemId}x${s!.count}`)
        .join(', ')}\n`,
  );
});

test('diagnóstico de upgrade', { timeout: 600_000 }, async () => {
  if (!process.env.HERO_DIAG) return;
  const { bestUpgrade } = await import('../../src/game/ai/heroBrain');
  const sim = makeSim('druid', { seed: 5 });
  const w = sim.world;
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, {
    id: hero.slotId,
    name: hero.name,
    vocation: hero.vocation,
    now: 0,
    position: w.map.playerStart,
  });
  const h = sim.addHero(hero, c) as HeroEntity;
  for (let s = 0; s < 50 * 60; s++) advance(sim, 1000, 50);
  const ch = h.character;
  process.stderr.write(
    `nível ${ch.level} ouro ${ch.gold} banco ${ch.bankGold} modo ${h.brain.mode} passos ${JSON.stringify(h.brain.town)}\n`,
  );
  process.stderr.write(
    `equip ${JSON.stringify(ch.equipment)}\nmochila ${JSON.stringify(ch.inventory.filter(Boolean))}\n`,
  );
  process.stderr.write(
    `upgrade(total) ${JSON.stringify(bestUpgrade(w, h, ch.gold + ch.bankGold - 400))} upgrade(bolsa) ${JSON.stringify(bestUpgrade(w, h, ch.gold - 30))}\n`,
  );
});

test('onde o herói trava', { timeout: 600_000 }, () => {
  if (!process.env.HERO_STUCK) return;
  const sim = makeSim('druid', { seed: 7 });
  const w = sim.world;
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, {
    id: hero.slotId,
    name: hero.name,
    vocation: hero.vocation,
    now: 0,
    position: w.map.playerStart,
  });
  const h = sim.addHero(hero, c) as HeroEntity;
  const spot = process.env.HERO_HUMAN!.split(',').map(Number);
  sim.teleportPlayer(spot[0]!, spot[1]!);
  let still = 0;
  let last = { x: h.x, y: h.y };
  for (let s = 0; s < 40 * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    if (h.x === last.x && h.y === last.y && !h.targetId && !h.dead) still++;
    else {
      if (still >= 5)
        process.stderr.write(
          `parado ${still}s em ${last.x},${last.y} modo ${h.brain.mode} passo ${JSON.stringify(h.brain.town[0] ?? null)} meta ${JSON.stringify(h.pathGoal)}\n`,
        );
      still = 0;
    }
    last = { x: h.x, y: h.y };
  }
});
