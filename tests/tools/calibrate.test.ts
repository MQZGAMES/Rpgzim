// Ferramenta de balanceamento: margem da régua de ameaça de um herói "ideal" (melhor equipamento disponível para o
// nível, skills típicas) contra grupos de 3 criaturas de cada espécie. Meta: margem parecida em todas as faixas.
// Uso: RPGZIM_TOOLS=1 npx vitest run tests/tools/calibrate.test.ts
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { computeStats } from '../../src/domain/rules/stats';
import { canUseItem, itemScore } from '../../src/domain/rules/itemPower';
import { fightMargin } from '../../src/game/ai/heroThreat';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import type { EquipSlot } from '../../src/domain/entities/definitions';
import { makeSim } from '../helpers';

const SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'head', 'body', 'legs', 'feet', 'ring', 'amulet'];

export function idealHero(vocation: 'knight' | 'paladin' | 'sorcerer' | 'druid', level: number) {
  const sim = makeSim(vocation, { seed: 5 });
  const w = sim.world;
  const hero = Object.values(GAME_DATA.heroes).find((d) => d.vocation === vocation)!;
  const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation, now: 0, position: w.map.playerStart });
  const h = sim.addHero(hero, c) as HeroEntity;
  c.level = level;
  const sk = 10 + 0.55 * (level - 1);
  for (const s of ['sword', 'axe', 'club', 'distance', 'shielding'] as const) c.skills[s].level = Math.round(sk);
  c.skills.magic.level = Math.round(level * 0.55);
  c.equipment = {};
  for (const slot of SLOTS) {
    const cands = Object.values(GAME_DATA.items).filter((d) => d.slot === slot && !d.weapon?.training && canUseItem(d, c));
    const ok = cands.filter((d) => (slot === 'mainHand' ? (vocation === 'paladin' ? d.weapon?.kind === 'distance' && !!d.twoHanded : !d.twoHanded) : true));
    if (slot === 'offHand' && vocation === 'paladin') continue;
    const best = ok.sort((a, b) => itemScore(b) - itemScore(a))[0];
    if (best) c.equipment[slot] = { itemId: best.id, count: 1 };
  }
  c.inventory[0] = { itemId: GAME_DATA.items.potion_health_supreme ? 'potion_health_supreme' : 'potion_health', count: 8 };
  h.stats = computeStats(GAME_DATA, c);
  c.health = h.stats.maxHealth;
  return { w, h };
}

const protos = (id: string, n: number) => Array.from({ length: n }, () => ({ def: GAME_DATA.monsters[id]!, hp: GAME_DATA.monsters[id]!.health }) as unknown as MonsterEntity);

test('calibração: margem por nível/criatura', () => {
  const levels = (process.env.CAL_LEVELS ?? '1,6,12,20,30,40,50,60,70,80,90,100').split(',').map(Number);
  const out: string[] = [];
  for (const voc of ['knight', 'paladin', 'sorcerer', 'druid'] as const) {
    out.push(`--- ${voc}`);
    for (const L of levels) {
      const { w, h } = idealHero(voc, L);
      // criaturas "da faixa": nível da espécie mais próximo (e até 3 abaixo) do nível do herói
      const mons = Object.values(GAME_DATA.monsters).filter((m) => (m.level ?? 1) <= L + 2 && (m.level ?? 1) >= L - 10).sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
      const row = mons.slice(0, 4).map((m) => `${m.id}(L${m.level}) ${fightMargin(w, h, protos(m.id, 3)).toFixed(2)}`);
      out.push(`L${String(L).padStart(3)} hp ${h.stats.maxHealth} arm ${h.stats.armor} ${h.stats.weapon.itemId} | ${row.join(' · ') || '-'}`);
    }
  }
  process.stderr.write(out.join('\n') + '\n');
});

test('calibração: margem de cada espécie contra um herói do nível dela', () => {
  const out: string[] = [];
  const mons = Object.values(GAME_DATA.monsters).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const heroes = (['knight', 'paladin', 'sorcerer', 'druid'] as const);
  out.push('espécie(nível) | ' + heroes.join(' | ') + '   [margem contra 3 criaturas, herói do nível da espécie, melhor equipamento]');
  const cache = new Map<string, ReturnType<typeof idealHero>>();
  for (const m of mons) {
    const row = heroes.map((v) => {
      const key = `${v}:${m.level}`;
      if (!cache.has(key)) cache.set(key, idealHero(v, m.level ?? 1));
      const { w, h } = cache.get(key)!;
      return fightMargin(w, h, protos(m.id, 3)).toFixed(1).padStart(6);
    });
    out.push(`${m.id.padEnd(14)} L${String(m.level).padStart(3)} xp ${String(m.experience).padStart(6)} hp ${String(m.health).padStart(5)} | ${row.join(' | ')}`);
  }
  process.stderr.write(out.join(String.fromCharCode(10)) + String.fromCharCode(10));
});
