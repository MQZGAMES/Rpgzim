// Ferramenta de desenvolvimento (não roda no `npm test`): compara as vocações nível a nível usando as
// mesmas fórmulas do jogo (dano, mitigação, bloqueio, curas) e o melhor equipamento disponível em cada
// nível. Gera docs/BALANCE-REPORT.md. Uso: npm run art:world (roda todas as ferramentas).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { computeStats, weaponSkillLevel, type DerivedStats } from '../../src/domain/rules/stats';
import { blockChance, distanceHitChance, maxWeaponDamage, spellRange } from '../../src/domain/rules/damage';
import type { EquipSlot, ItemDef, MonsterDef, SpellDef } from '../../src/domain/entities/definitions';
import type { CharacterState } from '../../src/domain/entities/character';
import type { VocationId } from '../../src/domain/value-objects/ids';

const D = GAME_DATA;
const VOCS: VocationId[] = ['knight', 'paladin', 'sorcerer', 'druid'];
const LEVELS = [1, 3, 5, 8, 10, 12, 15, 18, 20];

/** Progressão típica de skills por nível (estimativa de caça contínua; ver docs/BALANCE.md). */
function skillsAt(voc: VocationId, L: number) {
  const n = L - 1;
  const main = Math.round(10 + 2 * n);
  const base = { sword: 10, axe: 10, club: 10, distance: 10, shielding: 10, magic: 0 };
  if (voc === 'knight') return { ...base, sword: main, axe: main, club: main, shielding: Math.round(10 + 1.8 * n), magic: Math.round(0.2 * n) };
  if (voc === 'paladin') return { ...base, distance: main, shielding: Math.round(10 + 0.8 * n), magic: Math.round(0.5 * n) };
  return { ...base, shielding: Math.round(10 + 0.3 * n), magic: Math.round(1.3 * n) };
}

/** Escolhe por slot o item de maior "pontuação" que a vocação pode usar neste nível. */
function bestGear(voc: VocationId, L: number): Partial<Record<EquipSlot, string>> {
  const allowed = Object.values(D.items).filter((i) => i.slot && (!i.vocations || i.vocations.includes(voc)) && (i.minLevel ?? 1) <= L);
  const pick = (slot: EquipSlot, score: (i: ItemDef) => number, filter: (i: ItemDef) => boolean = () => true) =>
    allowed.filter((i) => i.slot === slot && filter(i)).sort((a, b) => score(b) - score(a))[0]?.id;
  const def = (i: ItemDef) => (i.armor ?? 0) * 10 + (i.defense ?? 0) * 10 + (i.bonuses?.maxHealth ?? 0) + (i.bonuses?.maxMana ?? 0) * (voc === 'sorcerer' || voc === 'druid' ? 3 : 0.2) + (i.bonuses?.magicLevel ?? 0) * (voc === 'sorcerer' || voc === 'druid' ? 40 : 0) + (i.bonuses?.speed ?? 0) * 10 + Object.values(i.bonuses?.skills ?? {}).reduce((s, v) => s + (v ?? 0), 0) * 8;
  const g: Partial<Record<EquipSlot, string>> = {};
  if (voc === 'knight') g.mainHand = pick('mainHand', (i) => i.weapon!.attack, (i) => i.weapon?.kind === 'melee' && !i.twoHanded);
  if (voc === 'paladin') g.mainHand = pick('mainHand', (i) => i.weapon!.attack, (i) => i.weapon?.kind === 'distance' && !!i.weapon.ammo);
  if (voc === 'sorcerer' || voc === 'druid') g.mainHand = pick('mainHand', (i) => (i.weapon!.damage?.[0] ?? 0) + (i.weapon!.damage?.[1] ?? 0), (i) => i.weapon?.kind === 'wand');
  const twoHanded = !!(g.mainHand && D.items[g.mainHand]!.twoHanded);
  for (const slot of ['head', 'amulet', 'body', 'legs', 'ring', 'feet'] as EquipSlot[]) g[slot] = pick(slot, def);
  if (!twoHanded) g.offHand = pick('offHand', def);
  if (voc === 'paladin') g.ammo = 'arrow';
  return g;
}

function profile(voc: VocationId, L: number): { c: CharacterState; s: DerivedStats; gear: Partial<Record<EquipSlot, string>> } {
  const c = createCharacter(D, { id: 'x', name: 'Teste', vocation: voc, now: 0, position: { x: 0, y: 0 } });
  c.level = L;
  const sk = skillsAt(voc, L);
  for (const [k, v] of Object.entries(sk)) c.skills[k as keyof typeof sk].level = v;
  const gear = bestGear(voc, L);
  c.equipment = {};
  for (const [slot, id] of Object.entries(gear)) if (id) c.equipment[slot as EquipSlot] = { itemId: id, count: slot === 'ammo' ? 100 : 1 };
  return { c, s: computeStats(D, c), gear };
}

const avg = (r: [number, number]) => (r[0] + r[1]) / 2;
/** Dano médio de um golpe físico após a armadura média (armadura * 0.75). */
const afterArmor = (raw: number, armor: number) => Math.max(0, raw - armor * 0.75);

function autoAttackDps(voc: VocationId, c: CharacterState, s: DerivedStats, m: MonsterDef): { dps: number; manaPerSec: number } {
  const v = D.vocations[voc];
  const w = s.weapon;
  if (w.kind === 'wand') {
    const raw = (avg(w.damage as [number, number]) + s.magicLevel * 0.5) * v.damage.magic;
    const res = m.resistances?.[w.element] ?? 1;
    return { dps: (raw * res) / (s.attackIntervalMs / 1000), manaPerSec: (w.manaCost ?? 0) / (s.attackIntervalMs / 1000) };
  }
  const mod = w.kind === 'distance' ? v.damage.distance : v.damage.melee;
  const max = maxWeaponDamage({ level: c.level, skill: weaponSkillLevel(s), weaponAttack: w.attack, vocationModifier: mod });
  // média do rolo uniforme entre 35% e 100% do máximo
  const raw = max * 0.675;
  const hit = w.kind === 'distance' ? distanceHitChance(weaponSkillLevel(s)) : 1;
  const dmg = afterArmor(raw, m.armor) * (m.resistances?.physical ?? 1) * hit;
  return { dps: dmg / (s.attackIntervalMs / 1000), manaPerSec: 0 };
}

function spellAvg(sp: SpellDef, voc: VocationId, c: CharacterState, s: DerivedStats, m: MonsterDef | null): number {
  const v = D.vocations[voc];
  const f = sp.formula!;
  const power = f.kind === 'magic' ? s.magicLevel : f.kind === 'distance' ? s.skills.distance : s.skills[s.weapon.skill === 'magic' ? 'club' : s.weapon.skill];
  const mod = sp.effect === 'heal' ? v.damage.healing : f.kind === 'magic' ? v.damage.magic : f.kind === 'distance' ? v.damage.distance : v.damage.melee;
  const r = spellRange(f, { level: c.level, power, weaponAttack: sp.effect === 'heal' ? 0 : s.weapon.attack }, mod);
  if (!m) return avg(r);
  const raw = sp.element === 'physical' ? afterArmor(avg(r), m.armor) : avg(r);
  return raw * (m.resistances?.[sp.element] ?? 1);
}

const usable = (sp: SpellDef, voc: VocationId, c: CharacterState, s: DerivedStats) => sp.vocations.includes(voc) && c.level >= sp.minLevel && s.magicLevel >= sp.minMagicLevel;

function manaRegenPerSec(voc: VocationId, L: number) {
  const v = D.vocations[voc];
  return (v.regen.mana + Math.floor(L / 4)) / (D.balance.player.regenTickMs / 1000);
}
function hpRegenPerSec(voc: VocationId, L: number) {
  const v = D.vocations[voc];
  return (v.regen.health + Math.floor(L / 5)) / (D.balance.player.regenTickMs / 1000);
}

/** Dano por segundo que um monstro causa ao personagem (média), considerando bloqueio, armadura e reduções. */
function incomingDps(s: DerivedStats, m: MonsterDef): number {
  const a = m.attack;
  let raw = (a.min + a.max) / 2;
  if (a.element === 'physical') {
    raw = afterArmor(raw, s.armor) * (1 - s.physicalReduction);
    const b = D.balance.combat;
    raw *= 1 - blockChance(s.skills.shielding, s.shieldDefense, b.blockChanceBase, b.blockChancePerSkill, b.maxBlockChance);
  }
  return raw / (a.intervalMs / 1000);
}

/** Monstro de referência para cada faixa de nível. */
function refMonster(L: number): MonsterDef {
  const id = L <= 2 ? 'slime' : L <= 4 ? 'boar' : L <= 6 ? 'goblin' : L <= 9 ? 'wolf' : L <= 11 ? 'spider' : L <= 14 ? 'skeleton' : 'goblin_chief';
  return D.monsters[id]!;
}

test('relatório de balanceamento', () => {
  const rows: string[] = [];
  const gearRows: string[] = [];
  const summary: Record<string, number[]> = {};
  for (const L of LEVELS) {
    const m = refMonster(L);
    for (const voc of VOCS) {
      const { c, s, gear } = profile(voc, L);
      const aa = autoAttackDps(voc, c, s, m);
      const dmgSpells = Object.values(D.spells).filter((sp) => usable(sp, voc, c, s) && sp.effect === 'damage' && (sp.target === 'target' || sp.target === 'areaTarget'));
      // rotação: magias de alvo único em recarga (com poções = sem limite de mana)
      let spellDps = 0;
      let spellMana = 0;
      for (const sp of dmgSpells) {
        spellDps += spellAvg(sp, voc, c, s, m) / (sp.cooldownMs / 1000);
        spellMana += sp.manaCost / (sp.cooldownMs / 1000);
      }
      // o recarregamento global (1 s) limita a soma de usos por segundo
      const regen = manaRegenPerSec(voc, L);
      const manaLeft = Math.max(0, regen - aa.manaPerSec);
      const sustainFactor = spellMana > 0 ? Math.min(1, manaLeft / spellMana) : 0;
      const wandFactor = aa.manaPerSec > 0 ? Math.min(1, regen / aa.manaPerSec) : 1;
      const dpsRegen = aa.dps * wandFactor + spellDps * sustainFactor;
      const dpsMax = aa.dps + spellDps;
      const heal = Object.values(D.spells).filter((sp) => usable(sp, voc, c, s) && sp.effect === 'heal').map((sp) => ({ sp, v: spellAvg(sp, voc, c, s, null) + (sp.buff?.kind === 'regen' ? (sp.buff.value * sp.buff.durationMs) / 2000 : 0) }));
      const bestHeal = heal.sort((a, b) => b.v / b.sp.cooldownMs - a.v / a.sp.cooldownMs)[0];
      const hps = bestHeal ? bestHeal.v / (bestHeal.sp.cooldownMs / 1000) : 0;
      const healPerMana = bestHeal ? bestHeal.v / bestHeal.sp.manaCost : 0;
      const inc = incomingDps(s, m);
      const ttk = m.health / Math.max(0.1, dpsMax);
      const ttd = s.maxHealth / Math.max(0.1, inc - hpRegenPerSec(voc, L));
      rows.push(`| ${L} | ${D.vocations[voc].name} | ${m.name} | ${s.maxHealth} | ${s.maxMana} | ${s.armor} | ${aa.dps.toFixed(1)} | ${dpsRegen.toFixed(1)} | ${dpsMax.toFixed(1)} | ${hps.toFixed(1)} | ${healPerMana.toFixed(2)} | ${inc.toFixed(1)} | ${ttk.toFixed(1)} s | ${ttd > 0 && Number.isFinite(ttd) ? ttd.toFixed(0) + ' s' : '∞'} |`);
      gearRows.push(`| ${L} | ${D.vocations[voc].name} | ${Object.entries(gear).filter(([k]) => k !== 'ammo').map(([, id]) => D.items[id!]!.name).join(', ')} |`);
      (summary[voc] ??= []).push(dpsMax);
    }
  }
  const md = [
    '# Relatório de balanceamento (gerado)',
    '',
    'Gerado por `tests/tools/balance-report.test.ts` (`npm run art:world`). Usa as fórmulas reais do jogo, o melhor',
    'equipamento disponível para cada vocação no nível e uma progressão típica de skills (skill principal = 10 + 2 por nível;',
    'Magic Level de magos = 1,3 por nível). É uma estimativa para comparar vocações, não uma simulação de caça.',
    '',
    '- **DPS auto**: só o ataque automático. **DPS regen**: auto + magias de alvo limitadas pela regeneração de mana.',
    '- **DPS máx.**: auto + todas as magias de alvo em recarga (bebendo poções de mana).',
    '- **Cura/s** e **cura/mana**: melhor magia de cura disponível. **Recebido/s**: dano médio do monstro de referência após armadura, bloqueio e reduções.',
    '- **Matar**: tempo para matar o monstro de referência com DPS máx. **Morrer**: tempo até morrer apanhando dele sem se curar (descontada a regeneração).',
    '',
    '| Nv | Vocação | Monstro | Vida | Mana | Arm. | DPS auto | DPS regen | DPS máx. | Cura/s | Cura/mana | Recebido/s | Matar | Morrer |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Equipamento considerado',
    '',
    '| Nv | Vocação | Itens |',
    '|---|---|---|',
    ...gearRows,
    '',
  ].join('\n');
  const out = join(process.cwd(), 'docs');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'BALANCE-REPORT.md'), md);
  console.log(rows.join('\n'));
});
