// Formato de save versionado, com validação defensiva e migrações.
// Saves locais NÃO são protegidos contra adulteração; a validação apenas impede dados corrompidos de quebrar o jogo.
import type { CharacterState, ItemStack } from '../../domain/entities/character';
import { EQUIP_SLOTS, SKILL_IDS, type EquipSlot } from '../../domain/entities/definitions';
import type { GameData } from '../../domain/entities/gameData';
import { normalizeHotbar } from '../../domain/rules/hotbar';
import { isVocationId } from '../../domain/value-objects/ids';
import { MAX_LEVEL, levelForXp } from '../../domain/rules/experience';
import { sanitizeName } from '../../domain/rules/character';

export const SAVE_VERSION = 3;

export interface SaveFile {
  version: number;
  savedAt: number;
  character: CharacterState;
}

export class SaveValidationError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Migrações por versão: cada função converte da versão N para N+1. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 não tinha hotbar nem estatísticas
  1: (raw) => {
    const c = isObj(raw.character) ? { ...raw.character } : {};
    if (!Array.isArray(c.hotbar)) c.hotbar = [];
    if (!isObj(c.stats)) c.stats = { monstersKilled: 0, deaths: 0, playTimeMs: 0 };
    return { ...raw, version: 2, character: c };
  },
  // v2 não tinha banco/depósito
  2: (raw) => {
    const c = isObj(raw.character) ? { ...raw.character } : {};
    if (!Array.isArray(c.depot)) c.depot = [];
    if (typeof c.bankGold !== 'number') c.bankGold = 0;
    return { ...raw, version: 3, character: c };
  },
};

export function migrate(raw: unknown): Record<string, unknown> {
  if (!isObj(raw)) throw new SaveValidationError('Save inválido.');
  let cur = raw;
  let v = num(cur.version, 0);
  if (v < 1 || v > SAVE_VERSION) throw new SaveValidationError(`Versão de save não suportada: ${String(cur.version)}`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveValidationError(`Sem migração a partir da versão ${v}`);
    cur = m(cur);
    v = num(cur.version, v + 1);
  }
  return cur;
}

function validStack(data: GameData, v: unknown): ItemStack | null {
  if (!isObj(v) || typeof v.itemId !== 'string' || !data.items[v.itemId]) return null;
  const def = data.items[v.itemId]!;
  const max = def.stackable ? (def.maxStack ?? 100) : 1;
  const count = Math.floor(num(v.count, 1, 1, max));
  return { itemId: v.itemId, count };
}

/** Converte dados desconhecidos (de armazenamento) em um CharacterState consistente, ou lança erro. */
export function parseSave(data: GameData, raw: unknown): SaveFile {
  const file = migrate(raw);
  const c = file.character;
  if (!isObj(c)) throw new SaveValidationError('Personagem ausente no save.');
  if (typeof c.id !== 'string' || !c.id) throw new SaveValidationError('Id de personagem inválido.');
  if (!isVocationId(c.vocation)) throw new SaveValidationError('Vocação inválida.');
  const name = sanitizeName(typeof c.name === 'string' ? c.name : '');
  if (name.length < 3) throw new SaveValidationError('Nome inválido.');
  const experience = Math.floor(num(c.experience, 0, 0, 1e12));
  // o nível é sempre coerente com a experiência (a penalidade de morte nunca cruza o piso do nível)
  const level = Math.min(MAX_LEVEL, levelForXp(experience, data.balance.experience));
  const skillsRaw = isObj(c.skills) ? c.skills : {};
  const skills = {} as CharacterState['skills'];
  for (const s of SKILL_IDS) {
    const r = skillsRaw[s];
    const base = s === 'magic' ? 0 : data.balance.skills.startLevel;
    skills[s] = { level: Math.floor(num(isObj(r) ? r.level : undefined, base, base, 200)), tries: num(isObj(r) ? r.tries : undefined, 0, 0, 1e9) };
  }
  const slots = data.balance.player.inventorySlots;
  const invRaw = Array.isArray(c.inventory) ? c.inventory : [];
  const inventory: (ItemStack | null)[] = new Array(slots).fill(null);
  for (let i = 0; i < Math.min(slots, invRaw.length); i++) inventory[i] = validStack(data, invRaw[i]);
  const depotSlots = data.balance.player.depotSlots;
  const depotRaw = Array.isArray(c.depot) ? c.depot : [];
  const depot: (ItemStack | null)[] = new Array(depotSlots).fill(null);
  for (let i = 0; i < Math.min(depotSlots, depotRaw.length); i++) depot[i] = validStack(data, depotRaw[i]);
  const equipment: CharacterState['equipment'] = {};
  const eqRaw = isObj(c.equipment) ? c.equipment : {};
  for (const slot of EQUIP_SLOTS as readonly EquipSlot[]) {
    const st = validStack(data, eqRaw[slot]);
    if (st && data.items[st.itemId]!.slot === slot) equipment[slot] = st;
  }
  const pos = isObj(c.position) ? c.position : {};
  const statsRaw = isObj(c.stats) ? c.stats : {};
  const flagsRaw = isObj(c.flags) ? c.flags : {};
  const flags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(flagsRaw)) if (typeof v === 'boolean') flags[k] = v;
  const character: CharacterState = {
    id: c.id,
    name,
    vocation: c.vocation,
    level,
    experience,
    health: num(c.health, 1, 0, 1e6),
    mana: num(c.mana, 0, 0, 1e6),
    skills,
    inventory,
    equipment,
    gold: Math.floor(num(c.gold, 0, 0, 1e9)),
    depot,
    bankGold: Math.floor(num(c.bankGold, 0, 0, 1e9)),
    position: { x: Math.floor(num(pos.x, 0, 0, 10000)), y: Math.floor(num(pos.y, 0, 0, 10000)) },
    facing: c.facing === 'up' || c.facing === 'left' || c.facing === 'right' ? c.facing : 'down',
    hotbar: normalizeHotbar(data, c.vocation, Array.isArray(c.hotbar) ? c.hotbar : []),
    flags,
    stats: {
      monstersKilled: Math.floor(num(statsRaw.monstersKilled, 0, 0, 1e9)),
      deaths: Math.floor(num(statsRaw.deaths, 0, 0, 1e9)),
      playTimeMs: num(statsRaw.playTimeMs, 0, 0, 1e13),
    },
    createdAt: num(c.createdAt, Date.now()),
    updatedAt: num(c.updatedAt, Date.now()),
  };
  return { version: SAVE_VERSION, savedAt: num(file.savedAt, Date.now()), character };
}

export function toSaveFile(character: CharacterState): SaveFile {
  return { version: SAVE_VERSION, savedAt: Date.now(), character: structuredClone(character) };
}
