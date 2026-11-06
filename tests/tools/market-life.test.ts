// Ferramenta: os quatro heróis vivendo juntos por N minutos — o mercado que eles criam (anúncios, ofertas de compra,
// negócios fechados) e como ficam nível, mortes e ouro.
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { escrowOf } from '../../src/domain/rules/market';
import type { HeroEntity } from '../../src/game/entities/types';
import { advance, makeSim } from '../helpers';

test('mercado vivo', { timeout: 900_000 }, () => {
  const minutes = Number(process.env.HERO_MINUTES ?? 120);
  const sim = makeSim('knight', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  const hs = ['boladex', 'maguim', 'mano_cura', 'distanciado'].map((id) => {
    const hero = GAME_DATA.heroes[id]!;
    const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart });
    return sim.addHero(hero, c) as HeroEntity;
  });
  sim.teleportPlayer(20, 40); // o jogador humano fica parado longe do caminho
  const lines: string[] = [];
  const trades = () => Object.values(w.market.history).reduce((s, h) => s + h.reduce((a, t) => a + t.count, 0), 0);
  for (let s = 0; s < minutes * 60; s++) {
    advance(sim, 1000, 50);
    w.human.character.health = w.human.stats.maxHealth;
    if ((s + 1) % 1800 === 0) {
      const sells = w.market.offers.filter((o) => o.side === 'sell');
      const buys = w.market.offers.filter((o) => o.side === 'buy');
      lines.push(
        `${Math.round(w.now / 60000)} min · anúncios ${sells.length} · ofertas de compra ${buys.length} · unidades negociadas ${trades()} · ` +
          hs.map((h) => `${h.character.name} nv${h.character.level} m${h.character.stats.deaths} $${h.character.gold + h.character.bankGold}+${escrowOf(w.market, h.character.id)}`).join(' | '),
      );
    }
  }
  const hist = Object.entries(w.market.history)
    .map(([id, h]) => `${id}: ${h.map((t) => `${t.count}x${t.price}`).join(',')}`)
    .join('\n');
  const open = w.market.offers.map((o) => `${o.side} ${o.ownerName} ${o.count}x ${o.itemId} @${o.price}`).join('\n');
  process.stderr.write(`${lines.join('\n')}\n\nNEGÓCIOS\n${hist}\n\nABERTAS\n${open}\n`);
});
