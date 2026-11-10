// Ferramenta: autópsia das mortes dos heróis. Solta os heróis em vários níveis por N minutos (em várias sementes) e,
// a cada morte, imprime os últimos segundos: modo, vida, poções, quantas criaturas encostadas/atirando, se ele andou
// ou atacou, e as casas livres em volta. No fim, mortes por hora de herói e a causa mais comum.
//   RPGZIM_TOOLS=1 HERO_MINUTES=30 HERO_LEVELS=12,30,55,80 HERO_SEEDS=11,12,13 npx vitest run tests/tools/hero-deaths.test.ts
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { canEnter } from '../../src/game/movement/movement';
import { isPz } from '../../src/game/world/GameMap';
import { advance, makeCharacter, worldMap } from '../helpers';
import { customHeroDef } from '../../src/data/heroes';
import { createRng } from '../../src/domain/value-objects/rng';
import { GameSimulation } from '../../src/game/simulation/GameSimulation';
import type { HeroEntity } from '../../src/game/entities/types';

interface Snap {
  at: number;
  mode: string;
  hp: number;
  mana: number;
  pots: number;
  x: number;
  y: number;
  target: string | null;
  melee: number;
  shooters: number;
  free: number;
  attacked: boolean;
  path: number;
  speed: number;
}

test('autópsia das mortes', { timeout: 3_600_000 }, () => {
  if (!process.env.RPGZIM_TOOLS) return;
  const minutes = Number(process.env.HERO_MINUTES ?? 30);
  const levels = (process.env.HERO_LEVELS ?? '12,30,55,80').split(',').map(Number);
  const seeds = (process.env.HERO_SEEDS ?? '11,12,13').split(',').map(Number);
  const verbose = !process.env.HERO_QUIET;
  const out: string[] = [];
  const causes: Record<string, number> = {};
  let deaths = 0;
  let heroHours = 0;
  let levelsGained = 0;
  let kills = 0;
  let xp = 0;
  const flees: Record<string, number> = {};
  for (const seed of seeds)
    for (const level of levels) {
      const sim = new GameSimulation({
        data: GAME_DATA,
        map: worldMap(),
        character: makeCharacter('druid'),
        rng: createRng(seed),
        lifelike: !!process.env.HERO_LIFELIKE,
      });
      const w = sim.world;
      sim.teleportPlayer(20, 40);
      const vocs = ['knight', 'sorcerer', 'druid', 'paladin'] as const;
      const extra = Array.from({ length: Number(process.env.HERO_EXTRA ?? 0) }, (_, i) =>
        customHeroDef({ id: `bot_${i}`, name: `Bot${i}`, vocation: vocs[i % 4]! }),
      );
      const heroes = [...Object.values(GAME_DATA.heroes), ...extra].map((def) => {
        const c = createCharacter(GAME_DATA, {
          id: def.slotId,
          name: def.name,
          vocation: def.vocation,
          now: 0,
          position: w.map.playerStart,
        });
        c.level = level;
        c.bankGold = process.env.HERO_GOLD ? Number(process.env.HERO_GOLD) : 20000 + level * 400;
        for (const k of ['sword', 'club', 'axe', 'distance', 'shielding'] as const)
          if (c.skills[k]) c.skills[k].level = Math.round(10 + level * 1.1);
        c.skills.magic.level =
          def.vocation === 'sorcerer' || def.vocation === 'druid'
            ? Math.round(level * 1.1)
            : Math.round(level / 4);
        const h = sim.addHero(def, c) as HeroEntity;
        asActor(w, h, () => refreshStats(w));
        h.character.health = h.stats.maxHealth;
        h.character.mana = h.stats.maxMana;
        return h;
      });
      const ids = heroes.map((h) => h.id);
      const trace = new Map<string, Snap[]>(ids.map((id) => [id, []]));
      let onlineTicks = 0;
      const t = () =>
        `${String(Math.floor(w.now / 60000)).padStart(2, '0')}:${String(Math.floor((w.now % 60000) / 1000)).padStart(2, '0')}`;
      sim.events.on('entityDied', (e) => {
        if (e.kind === 'monster') kills++;
        const h = ids.includes(e.entityId) ? w.heroes.get(e.entityId) : undefined;
        if (!h) return;
        deaths++;
        const tr = trace.get(h.id)!;
        const last = tr.slice(-24); // ~6 s
        const shown = process.env.HERO_TRACE
          ? tr.slice(-Number(process.env.HERO_TRACE) * 4)
          : last.filter((_, i) => i % 3 === 0);
        const tiles = new Set(last.map((s) => `${s.x},${s.y}`)).size;
        const attacked = last.some((s) => s.attacked);
        const maxMelee = Math.max(0, ...last.map((s) => s.melee));
        const maxShoot = Math.max(0, ...last.map((s) => s.shooters));
        const end = last[last.length - 1];
        const modes = [...new Set(last.map((s) => s.mode))].join('>');
        const still = tiles <= 2;
        const cause =
          (still ? 'parado' : 'andando') +
          (end && end.free === 0 ? '+preso' : '') +
          (maxMelee >= 3 ? '+cercado' : maxMelee >= 1 ? '+corpo' : '') +
          (maxShoot >= 1 ? '+tiros' : '') +
          (end && end.pots === 0 ? '+semPoção' : '') +
          ` [${modes}]`;
        causes[cause] = (causes[cause] ?? 0) + 1;
        const mons = [...w.monsters.values()]
          .filter((m) => m.alive && m.targetId === h.id)
          .map(
            (m) =>
              `${m.def.id}@${Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y))}${m.def.attack.range > 2 ? 'R' : ''}`,
          );
        if (verbose)
          out.push(
            `s${seed} nv${level} ${t()} ☠ ${h.character.name} (${h.character.vocation}) por ${h.brain.lastHitBy} — ${cause} atacou=${attacked} casas=${tiles} fuga="${h.brain.retreatWhy ?? ''}" presa=${h.brain.quarry} atacantes=[${mons.join(',')}]\n` +
              shown
                .map(
                  (s) =>
                    `     ${((s.at - (end?.at ?? 0)) / 1000).toFixed(1)}s ${s.mode} hp${Math.round(s.hp * 100)} mp${Math.round(s.mana * 100)} pot${s.pots} (${s.x},${s.y}) corpo${s.melee} tiro${s.shooters} livres${s.free} rota${s.path} vel${s.speed} alvo=${s.target ?? '-'}${s.attacked ? ' ⚔' : ''}`,
                )
                .join('\n'),
          );
      });
      const lv0 = heroes.reduce((s, h) => s + h.character.level, 0);
      const xp0 = heroes.reduce((s, h) => s + h.character.experience, 0);
      const mode = new Map<string, string>();
      for (let s = 0; s < minutes * 60 * 4; s++) {
        advance(sim, 250, 50);
        w.human.character.health = w.human.stats.maxHealth;
        for (const id of ids) {
          // (no modo "gente" o herói desloga e volta como uma entidade nova: sempre pelo id)
          const h = w.heroes.get(id);
          if (!h) continue;
          onlineTicks++;
          if (h.brain.mode === 'retreat' && mode.get(id) !== 'retreat') {
            const why = (h.brain.retreatWhy ?? '?').split(' margem=')[0]!.trim().split(' ')[0]!;
            flees[why] = (flees[why] ?? 0) + 1;
          }
          mode.set(id, h.brain.mode);
          if (h.dead) continue;
          let melee = 0;
          let shooters = 0;
          for (const m of w.monsters.values()) {
            if (!m.alive || m.targetId !== h.id) continue;
            const d = Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y));
            if (d <= 1) melee++;
            else if (m.def.attack.range > 2 && d <= m.def.attack.range) shooters++;
          }
          let free = 0;
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
              if ((dx || dy) && canEnter(w, h.x + dx, h.y + dy, false, h.id)) free++;
          const tr = trace.get(h.id)!;
          tr.push({
            at: w.now,
            mode: h.brain.mode + (isPz(w.map, h.x, h.y) ? '(pz)' : ''),
            hp: h.character.health / Math.max(1, h.stats.maxHealth),
            mana: h.character.mana / Math.max(1, h.stats.maxMana),
            pots: h.character.inventory.reduce(
              (a, st) =>
                a +
                (st && GAME_DATA.items[st.itemId]?.use?.heal && !GAME_DATA.items[st.itemId]?.use?.mana
                  ? st.count
                  : 0),
              0,
            ),
            x: h.x,
            y: h.y,
            target: h.targetId ? (w.monsters.get(h.targetId)?.def.id ?? 'gente') : null,
            melee,
            shooters,
            free,
            attacked: w.now - h.lastAttackAt < 400,
            path: h.path?.length ?? 0,
            speed: Math.round(h.stats.speed * (w.now < h.slowUntil ? h.slowFactor : 1) * 10) / 10,
          });
          if (tr.length > 80) tr.shift();
        }
      }
      heroHours += onlineTicks / 4 / 3600;
      xp += ids.reduce((s, id, i) => s + (w.heroes.get(id) ?? heroes[i]!).character.experience, 0) - xp0;
      levelsGained += ids.reduce((s, id, i) => s + (w.heroes.get(id) ?? heroes[i]!).character.level, 0) - lv0;
    }
  const table = Object.entries(causes)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${String(v).padStart(3)} × ${k}`)
    .join('\n');
  process.stderr.write(
    `${out.join('\n')}\n\nCAUSAS\n${table}\n\nMORTES: ${deaths} em ${heroHours.toFixed(1)} h de herói = ${(deaths / heroHours).toFixed(2)}/h | níveis ganhos ${levelsGained} | XP ${Math.round(xp / 1000)}k | criaturas mortas ${kills}\nFUGAS: ${Object.entries(
      flees,
    )
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}\n`,
  );
});
