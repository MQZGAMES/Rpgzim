// Atributos derivados: combinam vocação, nível, skills, equipamentos e buffs ativos.
// São recalculados sempre que algo muda, garantindo atualização imediata após trocar equipamento.
import type { CharacterState } from '../entities/character';
import type { BuffKind, EquipSlot, SkillId, WeaponStats } from '../entities/definitions';
import { EQUIP_SLOTS, SKILL_IDS } from '../entities/definitions';
import type { GameData } from '../entities/gameData';

export interface ActiveBuff {
  kind: BuffKind;
  value: number;
  expiresAt: number;
  sourceSpell?: string;
}

export interface ResolvedWeapon extends WeaponStats {
  itemId: string | null;
}

export interface DerivedStats {
  maxHealth: number;
  maxMana: number;
  armor: number;
  shieldDefense: number;
  magicLevel: number;
  skills: Record<SkillId, number>;
  speed: number;
  attackIntervalMs: number;
  weapon: ResolvedWeapon;
  damageReduction: number;
  physicalReduction: number;
  distanceDamageBonus: number;
}

const UNARMED: ResolvedWeapon = { itemId: null, kind: 'melee', skill: 'club', attack: 7, range: 1, element: 'physical' };

export function baseMaxHealth(data: GameData, c: CharacterState): number {
  const v = data.vocations[c.vocation];
  return v.base.health + (c.level - 1) * v.perLevel.health;
}

/** Bônus de velocidade por nível: pequeno e com teto, para o nível 60 não ser uma fuga impossível para o nível 18. */
export function levelSpeedBonus(level: number): number {
  return Math.min(1, 0.0125 * Math.max(0, level - 1));
}

export function baseMaxMana(data: GameData, c: CharacterState): number {
  const v = data.vocations[c.vocation];
  return v.base.mana + (c.level - 1) * v.perLevel.mana;
}

export function sumBuff(buffs: readonly ActiveBuff[], kind: BuffKind): number {
  return buffs.filter((b) => b.kind === kind).reduce((s, b) => s + b.value, 0);
}

export function computeStats(data: GameData, c: CharacterState, buffs: readonly ActiveBuff[] = []): DerivedStats {
  const voc = data.vocations[c.vocation];
  let maxHealth = baseMaxHealth(data, c);
  let maxMana = baseMaxMana(data, c);
  let armor = 0;
  let shieldDefense = 0;
  // cada nível soma um pouquinho de velocidade (+0,0125 tiles/s, até +1,0 no nível 81): quem tem muito mais nível alcança quem tem pouco
  let speed = voc.baseSpeed + levelSpeedBonus(c.level);
  const skills = {} as Record<SkillId, number>;
  for (const s of SKILL_IDS) skills[s] = c.skills[s].level;
  let weapon: ResolvedWeapon = UNARMED;
  for (const slot of EQUIP_SLOTS as readonly EquipSlot[]) {
    const stack = c.equipment[slot];
    if (!stack) continue;
    const def = data.items[stack.itemId];
    if (!def) continue;
    armor += def.armor ?? 0;
    if (slot === 'offHand') shieldDefense += def.defense ?? 0;
    const b = def.bonuses;
    if (b) {
      maxHealth += b.maxHealth ?? 0;
      maxMana += b.maxMana ?? 0;
      speed += b.speed ?? 0;
      if (b.magicLevel) skills.magic += b.magicLevel;
      if (b.skills) for (const [k, v] of Object.entries(b.skills)) skills[k as SkillId] += v ?? 0;
    }
    if (slot === 'mainHand' && def.weapon) weapon = { itemId: def.id, ...def.weapon };
  }
  speed += sumBuff(buffs, 'haste');
  const attackSpeed = Math.min(0.5, sumBuff(buffs, 'attackSpeed'));
  const baseInterval = weapon.attackIntervalMs ?? voc.attackIntervalMs;
  return {
    maxHealth,
    maxMana,
    armor,
    shieldDefense,
    magicLevel: skills.magic,
    skills,
    speed,
    attackIntervalMs: Math.round(baseInterval * (1 - attackSpeed)),
    weapon,
    damageReduction: Math.min(0.6, sumBuff(buffs, 'defense')),
    physicalReduction: voc.physicalReduction,
    distanceDamageBonus: sumBuff(buffs, 'distanceDamage'),
  };
}

/** Valor efetivo da skill usada pela arma (varinhas usam Magic Level). */
export function weaponSkillLevel(stats: DerivedStats): number {
  return stats.weapon.skill === 'magic' ? stats.magicLevel : stats.skills[stats.weapon.skill];
}
