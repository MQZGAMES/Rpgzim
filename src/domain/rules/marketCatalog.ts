// Catálogo do mercado: em que categoria cada equipamento/poção aparece, os atributos resumidos e a comparação com o
// que o personagem está usando (melhor, pior, igual, não usa).
import type { CharacterState } from '../entities/character';
import type { EquipSlot, ItemDef } from '../entities/definitions';
import type { GameData } from '../entities/gameData';
import type { VocationId } from '../value-objects/ids';
import { itemAttack, itemDefense, itemScore } from './itemPower';
import { marketable } from './market';

export type MarketCategoryId =
  | 'sword'
  | 'axe'
  | 'club'
  | 'distance'
  | 'wand'
  | 'rod'
  | 'shield'
  | 'spellbook'
  | 'helmet'
  | 'armor'
  | 'legs'
  | 'boots'
  | 'ring'
  | 'amulet'
  | 'potion_health'
  | 'potion_mana';

export interface MarketCategory {
  id: MarketCategoryId;
  name: string;
  /** Ícone (de um item típico da categoria). */
  icon: string;
  group: 'Armas' | 'Defesa' | 'Acessórios' | 'Poções';
}

export const MARKET_CATEGORIES: readonly MarketCategory[] = [
  { id: 'sword', name: 'Espadas', icon: 'item_sword_iron', group: 'Armas' },
  { id: 'axe', name: 'Machados', icon: 'item_axe_battle', group: 'Armas' },
  { id: 'club', name: 'Maças', icon: 'item_mace_iron', group: 'Armas' },
  { id: 'distance', name: 'Arcos e lanças', icon: 'item_bow_hunting', group: 'Armas' },
  { id: 'wand', name: 'Varinhas', icon: 'item_wand_ember', group: 'Armas' },
  { id: 'rod', name: 'Cajados', icon: 'item_rod_sprout', group: 'Armas' },
  { id: 'shield', name: 'Escudos', icon: 'item_shield_iron', group: 'Defesa' },
  { id: 'spellbook', name: 'Livros', icon: 'item_spellbook', group: 'Defesa' },
  { id: 'helmet', name: 'Capacetes', icon: 'item_helmet_iron', group: 'Defesa' },
  { id: 'armor', name: 'Armaduras', icon: 'item_armor_chain', group: 'Defesa' },
  { id: 'legs', name: 'Calças', icon: 'item_legs_chain', group: 'Defesa' },
  { id: 'boots', name: 'Botas', icon: 'item_boots_leather', group: 'Defesa' },
  { id: 'ring', name: 'Anéis', icon: 'item_ring_power', group: 'Acessórios' },
  { id: 'amulet', name: 'Amuletos', icon: 'item_amulet_guard', group: 'Acessórios' },
  { id: 'potion_health', name: 'Poções de vida', icon: 'item_potion_health_great', group: 'Poções' },
  { id: 'potion_mana', name: 'Poções de mana', icon: 'item_potion_mana_great', group: 'Poções' },
];

/** Categoria do item no mercado (null = o mercado não negocia). */
export function categoryOf(def: ItemDef | undefined): MarketCategoryId | null {
  if (!def || !marketable(def)) return null;
  if (def.type === 'potion') return def.use?.mana && !def.use.heal ? 'potion_mana' : 'potion_health';
  const w = def.weapon;
  if (def.slot === 'mainHand' && w) {
    if (w.kind === 'wand') return def.vocations?.includes('druid') && !def.vocations.includes('sorcerer') ? 'rod' : 'wand';
    if (w.skill === 'distance') return 'distance';
    if (w.skill === 'axe') return 'axe';
    if (w.skill === 'club') return 'club';
    return 'sword';
  }
  if (def.slot === 'offHand') return def.type === 'spellbook' ? 'spellbook' : 'shield';
  const bySlot: Partial<Record<EquipSlot, MarketCategoryId>> = {
    head: 'helmet',
    body: 'armor',
    legs: 'legs',
    feet: 'boots',
    ring: 'ring',
    amulet: 'amulet',
  };
  return def.slot ? (bySlot[def.slot] ?? null) : null;
}

/** Atributos resumidos para a lista (ex.: "Atq 24 · Def 8", "Mana +150 · ML +2", "Cura 180"). */
export function shortStats(def: ItemDef): string {
  const parts: string[] = [];
  if (def.type === 'potion') {
    if (def.use?.heal) parts.push(`Cura ${def.use.heal}`);
    if (def.use?.mana) parts.push(`Mana ${def.use.mana}`);
    return parts.join(' · ');
  }
  const atk = itemAttack(def);
  if (atk !== null) parts.push(def.weapon?.kind === 'wand' ? `Dano ${atk}` : `Atq ${atk}`);
  const dfn = itemDefense(def);
  if (dfn !== null) parts.push(def.armor ? `Arm ${dfn}` : `Def ${dfn}`);
  const b = def.bonuses;
  if (b?.maxHealth) parts.push(`Vida +${b.maxHealth}`);
  if (b?.maxMana) parts.push(`Mana +${b.maxMana}`);
  if (b?.magicLevel) parts.push(`ML +${b.magicLevel}`);
  if (b?.speed) parts.push(`Vel +${b.speed}`);
  for (const [k, v] of Object.entries(b?.skills ?? {})) if (v) parts.push(`${k} +${v}`);
  if (def.twoHanded) parts.push('2 mãos');
  return parts.join(' · ');
}

/** Item do catálogo (dados fixos, independentes do personagem). */
export interface CatalogItem {
  itemId: string;
  name: string;
  icon: string;
  category: MarketCategoryId;
  slot: EquipSlot | null;
  minLevel: number;
  vocations: readonly VocationId[] | null;
  stats: string;
  attack: number | null;
  defense: number | null;
  score: number;
  value: number;
}

export function buildCatalog(data: GameData): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const def of Object.values(data.items)) {
    const category = categoryOf(def);
    if (!category || def.weapon?.training) continue; // armas de treino ficam só na loja
    out.push({
      itemId: def.id,
      name: def.name,
      icon: def.icon,
      category,
      slot: def.slot ?? null,
      minLevel: def.minLevel ?? 1,
      vocations: def.vocations ?? null,
      stats: shortStats(def),
      attack: itemAttack(def),
      defense: itemDefense(def),
      score: def.type === 'potion' ? (def.use?.heal ?? def.use?.mana ?? 0) : itemScore(def),
      value: def.value,
    });
  }
  return out;
}

export type Fit = 'better' | 'worse' | 'same' | 'usable' | 'level' | 'vocation';

/** Comparação com o que o personagem usa no mesmo slot (equipamento) ou com o nível dele (poção). */
export interface Comparison {
  fit: Fit;
  /** Diferenças de ataque/defesa em relação ao equipado (null = não se aplica). */
  attack: number | null;
  defense: number | null;
}

export function compareItem(data: GameData, c: CharacterState, def: ItemDef): Comparison {
  if (def.vocations && !def.vocations.includes(c.vocation)) return { fit: 'vocation', attack: null, defense: null };
  if ((def.minLevel ?? 1) > c.level) return { fit: 'level', attack: null, defense: null };
  if (!def.slot) return { fit: 'usable', attack: null, defense: null }; // poção: já pode beber
  const cur = c.equipment[def.slot];
  const curDef = cur ? data.items[cur.itemId] : undefined;
  const atk = itemAttack(def);
  const dfn = itemDefense(def);
  const dAtk = atk !== null || (curDef && itemAttack(curDef) !== null) ? (atk ?? 0) - (curDef ? (itemAttack(curDef) ?? 0) : 0) : null;
  const dDef = dfn !== null || (curDef && itemDefense(curDef) !== null) ? (dfn ?? 0) - (curDef ? (itemDefense(curDef) ?? 0) : 0) : null;
  if (!curDef) return { fit: 'better', attack: dAtk, defense: dDef };
  // armas só se comparam com armas do mesmo tipo (uma varinha não "melhora" uma espada)
  if (def.weapon && curDef.weapon && def.weapon.kind !== curDef.weapon.kind) return { fit: 'vocation', attack: null, defense: null };
  const diff = itemScore(def) - itemScore(curDef);
  return { fit: diff > 0 ? 'better' : diff < 0 ? 'worse' : 'same', attack: dAtk, defense: dDef };
}
