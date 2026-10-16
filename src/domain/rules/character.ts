// Criação de personagem a partir da vocação (atributos, equipamentos e itens iniciais definidos em dados).
import type { CharacterState } from '../entities/character';
import { SKILL_IDS, type SkillId } from '../entities/definitions';
import type { GameData } from '../entities/gameData';
import { defaultHotbar } from './hotbar';
import type { VocationId } from '../value-objects/ids';
import { addItem } from './inventory';
import { computeStats } from './stats';

export const NAME_MIN = 3;
export const NAME_MAX = 16;

export function sanitizeName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function validateName(raw: string): string | null {
  const n = sanitizeName(raw);
  if (n.length < NAME_MIN) return `O nome precisa ter ao menos ${NAME_MIN} letras.`;
  if (!/\p{L}/u.test(n)) return 'O nome precisa conter letras.';
  return null;
}

export function createCharacter(
  data: GameData,
  opts: { id: string; name: string; vocation: VocationId; now: number; position: { x: number; y: number } },
): CharacterState {
  const voc = data.vocations[opts.vocation];
  const skills = {} as Record<SkillId, { level: number; tries: number }>;
  for (const s of SKILL_IDS) skills[s] = { level: s === 'magic' ? 0 : data.balance.skills.startLevel, tries: 0 };
  const c: CharacterState = {
    id: opts.id,
    name: sanitizeName(opts.name),
    vocation: voc.id,
    level: 1,
    experience: 0,
    health: 1,
    mana: 0,
    skills,
    inventory: new Array(data.balance.player.inventorySlots).fill(null),
    equipment: {},
    gold: voc.startingGold,
    depot: new Array(data.balance.player.depotSlots).fill(null),
    bankGold: 0,
    position: { ...opts.position },
    facing: 'down',
    hotbar: defaultHotbar(data, opts.vocation),
    flags: {},
    stats: { monstersKilled: 0, deaths: 0, playTimeMs: 0 },
    createdAt: opts.now,
    updatedAt: opts.now,
  };
  for (const [slot, st] of Object.entries(voc.startingEquipment)) {
    if (st) c.equipment[slot as keyof typeof c.equipment] = { itemId: st.itemId, count: st.count ?? 1 };
  }
  for (const st of voc.startingInventory) addItem(data, c.inventory, st.itemId, st.count);
  const stats = computeStats(data, c);
  c.health = stats.maxHealth;
  c.mana = stats.maxMana;
  return c;
}
