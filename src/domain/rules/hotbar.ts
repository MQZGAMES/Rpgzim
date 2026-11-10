// Atalhos personalizáveis (barra de ações): cada posição guarda uma magia, um item usável da mochila
// ou uma "poção automática" (escolhe a poção certa para o que falta). Gravado como texto no personagem
// ("spell:id", "item:id", "potion:health"), compatível com saves antigos (só ids de magia).
import type { GameData } from '../entities/gameData';
import type { VocationId } from '../value-objects/ids';

/** Atalhos 1–9: a mesma ordem (e os mesmos números) no celular e no computador. */
export const HOTBAR_SIZE = 9;
/** Tamanho da barra nas versões antigas (os atalhos novos entram depois dele). */
const LEGACY_SIZE = 6;

export type HotbarEntry = { kind: 'spell'; id: string } | { kind: 'item'; id: string } | { kind: 'potion'; id: 'health' | 'mana' } | null;

export function parseHotbarEntry(raw: string | undefined | null): HotbarEntry {
  if (!raw) return null;
  const i = raw.indexOf(':');
  if (i < 0) return { kind: 'spell', id: raw }; // save antigo: só o id da magia
  const kind = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if (kind === 'spell' || kind === 'item') return { kind, id };
  if (kind === 'potion' && (id === 'health' || id === 'mana')) return { kind, id };
  return null;
}

export function encodeHotbarEntry(e: HotbarEntry): string {
  return e ? `${e.kind}:${e.id}` : '';
}

/** Atalhos padrão: as magias da vocação e as duas poções automáticas. */
export function defaultHotbar(data: GameData, vocation: VocationId): string[] {
  const spells = data.vocations[vocation].spells.slice(0, HOTBAR_SIZE - 2).map((id) => `spell:${id}`);
  while (spells.length < HOTBAR_SIZE - 2) spells.push('');
  return [...spells, 'potion:health', 'potion:mana'];
}

function valid(data: GameData, vocation: VocationId, e: HotbarEntry): boolean {
  if (!e) return false;
  if (e.kind === 'spell') return !!data.spells[e.id] && data.spells[e.id]!.vocations.includes(vocation);
  if (e.kind === 'item') return !!data.items[e.id]?.use;
  return true;
}

/** Ajusta qualquer lista salva para o formato atual (tamanho fixo, entradas válidas). */
export function normalizeHotbar(data: GameData, vocation: VocationId, raw: readonly unknown[]): string[] {
  // mantém as posições (entrada inválida vira atalho vazio)
  const list = raw.map((s) => (typeof s === 'string' ? s : ''));
  if (!list.some(Boolean)) return defaultHotbar(data, vocation);
  // save antigo (só magias, 4 posições): mantém as magias e acrescenta as poções automáticas
  const legacy = list.every((s) => !s.includes(':'));
  const base = legacy ? [...list.slice(0, LEGACY_SIZE - 2), ...new Array(Math.max(0, LEGACY_SIZE - 2 - list.length)).fill(''), 'potion:health', 'potion:mana'] : list;
  const out: string[] = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const e = parseHotbarEntry(base[i]);
    out.push(valid(data, vocation, e) ? encodeHotbarEntry(e) : '');
  }
  // barra antiga (6 ou 8 atalhos): as magias da vocação que ainda não estão na barra ocupam os atalhos novos
  const grown = legacy ? LEGACY_SIZE : list.length;
  if (grown < HOTBAR_SIZE) {
    const have = new Set(out);
    const fresh = data.vocations[vocation].spells.filter((id) => !have.has(`spell:${id}`));
    for (let i = grown; i < HOTBAR_SIZE && fresh.length; i++) if (!out[i]) out[i] = `spell:${fresh.shift()}`;
  }
  return out;
}

/** Coloca uma entrada numa posição; se ela já estava em outra posição, troca as duas de lugar. */
export function assignHotbar(hotbar: string[], index: number, entry: HotbarEntry): void {
  if (index < 0 || index >= HOTBAR_SIZE) return;
  const code = encodeHotbarEntry(entry);
  const prev = code ? hotbar.indexOf(code) : -1;
  if (prev >= 0 && prev !== index) hotbar[prev] = hotbar[index] ?? '';
  hotbar[index] = code;
}

// ------------------------------------------------------------------ conjuntos de favoritos
/** Quantos conjuntos de atalhos (favoritos) o personagem tem; o botão da tela alterna entre eles. */
export const HOTBAR_SETS = 3;

/** O que a troca de conjuntos precisa do personagem (a barra atual é sempre o conjunto ativo). */
export interface HotbarSetsState {
  hotbar: string[];
  hotbarSet: number;
  hotbarSets: string[][];
}

/**
 * Ajusta o que veio do save: `hotbar` é a barra do conjunto ativo (a verdade), `sets` guarda os outros. Save antigo, sem
 * conjuntos, vira "conjunto 1 = a barra de sempre" e os outros dois começam com o padrão da vocação.
 */
export function normalizeHotbarSets(
  data: GameData,
  vocation: VocationId,
  hotbar: readonly string[],
  sets: unknown,
  active: unknown,
): { hotbarSet: number; hotbarSets: string[][] } {
  const set = typeof active === 'number' && Number.isInteger(active) && active >= 0 && active < HOTBAR_SETS ? active : 0;
  const saved = Array.isArray(sets) ? sets : [];
  const out: string[][] = [];
  for (let i = 0; i < HOTBAR_SETS; i++) {
    const raw = i === set ? hotbar : Array.isArray(saved[i]) ? (saved[i] as unknown[]) : [];
    out.push(normalizeHotbar(data, vocation, raw));
  }
  return { hotbarSet: set, hotbarSets: out };
}

/** Passa para outro conjunto: guarda a barra atual no conjunto que sai e carrega a do que entra. */
export function switchHotbarSet(c: HotbarSetsState, to: number): boolean {
  if (!Number.isInteger(to) || to < 0 || to >= HOTBAR_SETS || to === c.hotbarSet) return false;
  c.hotbarSets[c.hotbarSet] = [...c.hotbar];
  c.hotbar = [...(c.hotbarSets[to] ?? [])];
  c.hotbarSet = to;
  return true;
}
