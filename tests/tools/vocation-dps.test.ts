// Ferramenta: dano por segundo de cada vocação por nível (golpe automático + rotação de magias de alvo único e de
// área), com o melhor equipamento do nível e skills/ML estimados pelo tempo de jogo até o nível (curvas reais de
// treino). Mostra quem está fraco e como o dano cresce. Uso: RPGZIM_TOOLS=1 npx vitest run tests/tools/vocation-dps.test.ts
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { maxWeaponDamage, spellRange, distanceHitChance } from '../../src/domain/rules/damage';
import type { ItemDef, MonsterDef, SpellDef } from '../../src/domain/entities/definitions';
import type { VocationId } from '../../src/domain/value-objects/ids';

const D = GAME_DATA;
const VOCS: VocationId[] = ['knight', 'paladin', 'sorcerer', 'druid'];
const LEVELS = [8, 15, 25, 35, 50, 65, 80, 100];

/** XP total até o nível. */
const xpAt = (L: number) => D.balance.experience.base * Math.max(0, L - 1) ** D.balance.experience.exponent;
/** Minutos de caça até o nível (XP/min ≈ 40 × nível, o que as simulações mostram). */
function minutesTo(L: number): number {
  let m = 0;
  for (let l = 2; l <= L; l++) m += (xpAt(l) - xpAt(l - 1)) / (40 * (l - 1));
  return m;
}
/** Skill alcançada com `tries` tentativas (curva real: 22 · 1,12^(n−10) · mult por nível). */
function skillFrom(tries: number, mult: number): number {
  const { baseTries, growth, startLevel } = D.balance.skills;
  let n = startLevel;
  let left = tries;
  while (left >= baseTries * growth ** (n - startLevel) * mult) {
    left -= baseTries * growth ** (n - startLevel) * mult;
    n++;
  }
  return n;
}
function mlFrom(mana: number, mult: number): number {
  const { baseMana, growth } = D.balance.magic;
  let n = 0;
  let left = mana;
  while (left >= baseMana * growth ** n * mult) {
    left -= baseMana * growth ** n * mult;
    n++;
  }
  return n;
}

/** Mana gasta por segundo: magos usam toda a regeneração mais poções; Paladin gasta pouco; Knight quase nada. */
const manaRate = (voc: VocationId, L: number) =>
  voc === 'sorcerer' || voc === 'druid' ? 4 + 0.12 * L : voc === 'paladin' ? 1.2 + 0.03 * L : 0.6 + 0.01 * L;

function skillsAt(voc: VocationId, L: number) {
  const sec = minutesTo(L) * 60;
  const v = D.vocations[voc];
  const atk = 1000 / v.attackIntervalMs;
  const mr = manaRate(voc, L);
  return {
    melee: skillFrom(sec * (voc === 'knight' ? atk : 0.02), v.skillMultipliers.sword),
    distance: skillFrom(sec * (voc === 'paladin' ? atk : 0.02), v.skillMultipliers.distance),
    magic: mlFrom(sec * mr, v.skillMultipliers.magic),
  };
}

function bestWeapon(voc: VocationId, L: number): ItemDef | undefined {
  return Object.values(D.items)
    .filter((i) => i.weapon && !i.weapon.training && (i.minLevel ?? 1) <= L && (!i.vocations || i.vocations.includes(voc)))
    .filter((i) =>
      voc === 'knight'
        ? i.weapon!.kind === 'melee' && !i.twoHanded
        : voc === 'paladin'
          ? i.weapon!.kind === 'distance'
          : i.weapon!.kind === 'wand',
    )
    .sort((a, b) =>
      voc === 'sorcerer' || voc === 'druid'
        ? (b.weapon!.damage?.[1] ?? 0) + (b.weapon!.damage?.[0] ?? 0) - ((a.weapon!.damage?.[1] ?? 0) + (a.weapon!.damage?.[0] ?? 0))
        : b.weapon!.attack - a.weapon!.attack,
    )[0];
}

/** Criatura típica de caça no nível (a de nível mais próximo de 0,8 × L). */
function refMonster(L: number): MonsterDef {
  return Object.values(D.monsters)
    .filter((m) => !m.elite && m.level !== undefined)
    .sort((a, b) => Math.abs(a.level! - L * 0.8) - Math.abs(b.level! - L * 0.8))[0]!;
}

const avg = (r: [number, number]) => (r[0] + r[1]) / 2;

export function vocationDps(voc: VocationId, L: number) {
  const v = D.vocations[voc];
  const sk = skillsAt(voc, L);
  const w = bestWeapon(voc, L);
  const mon = refMonster(L);
  const armor = mon.armor * 0.75;
  // resistências neutras (a comparação é da vocação; a escolha do elemento é da caça). RES=1 usa as da criatura
  const res = (el: string) => (process.env.RES ? (mon.resistances?.[el as keyof typeof mon.resistances] ?? 1) : 1);
  const weaponAttack = w?.weapon?.attack ?? 0;
  // golpe automático
  let basic = 0;
  if (w?.weapon?.kind === 'wand') {
    const dmg = ((w.weapon.damage?.[0] ?? 4) + (w.weapon.damage?.[1] ?? 8)) / 2 + sk.magic * 0.5;
    basic = (dmg * v.damage.magic * res(w.weapon.element)) / (v.attackIntervalMs / 1000);
  } else if (w) {
    const skill = voc === 'paladin' ? sk.distance : sk.melee;
    const mod = w.weapon!.kind === 'distance' ? v.damage.distance : v.damage.melee;
    const max = maxWeaponDamage({ level: L, skill, weaponAttack, vocationModifier: mod });
    const hit = w.weapon!.kind === 'distance' ? distanceHitChance(skill) : 1;
    basic = (Math.max(1, max * 0.675 - armor) * hit) / (v.attackIntervalMs / 1000);
  }
  // magias: cada segundo (recarga global de 1 s) lança a mais forte pronta; mana ilimitada (poções)
  const spells = v.spells
    .map((id) => D.spells[id]!)
    .filter((s): s is SpellDef & { formula: NonNullable<SpellDef['formula']> } =>
      s.effect === 'damage' && !!s.formula && !s.attract && s.minLevel <= L,
    );
  const value = (s: (typeof spells)[number], targets: number) => {
    const power = s.formula.kind === 'magic' ? sk.magic : s.formula.kind === 'distance' ? sk.distance : sk.melee;
    const mod = s.formula.kind === 'magic' ? v.damage.magic : s.formula.kind === 'distance' ? v.damage.distance : v.damage.melee;
    const wandPower = w?.weapon?.kind === 'wand' ? ((w.weapon.damage?.[0] ?? 0) + (w.weapon.damage?.[1] ?? 0)) / 2 : 0;
    const raw = avg(spellRange(s.formula, { level: L, power, weaponAttack, wandPower }, mod));
    const dmg = Math.max(0, s.element === 'physical' ? raw - armor : raw) * res(s.element);
    const hits = s.radius ? targets : 1;
    return dmg * hits;
  };
  // orçamento de mana por segundo (regeneração + poções que a vocação costuma gastar): o mesmo do treino de ML
  const budget = manaRate(voc, L);
  const rotation = (targets: number) => {
    const ready: Record<string, number> = {};
    let total = 0;
    let mana = 0;
    let pool = 0;
    for (let t = 0; t < 120; t++) {
      pool += budget;
      const pick = spells
        .filter((s) => (ready[s.id] ?? 0) <= t && s.manaCost <= pool)
        .sort((a, b) => value(b, targets) / Math.max(1, b.manaCost) - value(a, targets) / Math.max(1, a.manaCost) || value(b, targets) - value(a, targets))[0];
      if (!pick) continue;
      pool -= pick.manaCost;
      total += value(pick, targets);
      mana += pick.manaCost;
      ready[pick.id] = t + pick.cooldownMs / 1000;
    }
    return { dps: total / 120, mana: mana / 120 };
  };
  const single = rotation(1);
  const aoe = rotation(4);
  return { sk, weapon: w?.id ?? '-', mon: mon.id, basic, single, aoe };
}

test('dano por vocação', () => {
  if (!process.env.RPGZIM_TOOLS) return;
  const out: string[] = [];
  for (const L of LEVELS) {
    out.push(`\n== nível ${L} (≈${(minutesTo(L) / 60).toFixed(1)} h de caça) contra ${refMonster(L).id} (armadura ${refMonster(L).armor})`);
    const rows = VOCS.map((voc) => ({ voc, r: vocationDps(voc, L) }));
    const best = Math.max(...rows.map((x) => x.r.basic + x.r.single.dps));
    for (const { voc, r } of rows) {
      const tot = r.basic + r.single.dps;
      out.push(
        `${voc.padEnd(9)} skill ${String(r.sk.melee).padStart(3)}/${String(r.sk.distance).padStart(3)} ML ${String(r.sk.magic).padStart(3)} ${r.weapon.padEnd(22)} golpe ${r.basic.toFixed(1).padStart(6)} magia ${r.single.dps.toFixed(1).padStart(6)} (${r.single.mana.toFixed(1)} mana/s) = ${tot.toFixed(1).padStart(6)} (${Math.round((tot / best) * 100)}%) | área x4 ${(r.basic + r.aoe.dps).toFixed(1).padStart(6)}`,
      );
    }
  }
  process.stderr.write(out.join('\n') + '\n');
});
