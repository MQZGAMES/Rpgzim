// Ferramenta: custo de montar o snapshot com o mercado aberto e muitas ofertas.
import { test } from 'vitest';
import { buildCatalog } from '../../src/domain/rules/marketCatalog';
import { GAME_DATA } from '../../src/data';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { makeSim } from '../helpers';

test('perf do mercado', () => {
  const sim = makeSim('knight');
  const w = sim.world;
  w.ui.market = { npcId: 'npc:broker' };
  const cat = buildCatalog(GAME_DATA);
  for (let i = 0; i < 400; i++) {
    const it = cat[i % cat.length]!;
    w.market.offers.push({ id: `o${i}`, side: i % 3 ? 'sell' : 'buy', ownerId: `p${i % 7}`, ownerName: 'X', itemId: it.itemId, count: 1 + (i % 4), price: 10 + i, at: i });
  }
  for (let i = 0; i < 5; i++) buildSnapshot(sim, i);
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) buildSnapshot(sim, i);
  const ms = (performance.now() - t0) / 50;
  process.stderr.write(`snapshot com mercado (400 ofertas): ${ms.toFixed(2)} ms\n`);
  w.ui.market = null;
  const t1 = performance.now();
  for (let i = 0; i < 50; i++) buildSnapshot(sim, i);
  process.stderr.write(`snapshot sem mercado: ${((performance.now() - t1) / 50).toFixed(2)} ms\n`);
});
