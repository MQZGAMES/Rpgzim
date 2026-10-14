// Identificadores estáveis. Itens, magias, monstros e vocações usam ids de definição (strings fixas nos dados);
// entidades em tempo de execução usam ids únicos e serializáveis.
export type EntityId = string;
export type ItemId = string;
export type SpellId = string;
export type MonsterId = string;
export type NpcId = string;
export type ShopId = string;

export const VOCATION_IDS = ['sorcerer', 'druid', 'paladin', 'knight'] as const;
export type VocationId = (typeof VOCATION_IDS)[number];

export const PLAYER_ID: EntityId = 'player';

export function isVocationId(v: unknown): v is VocationId {
  return typeof v === 'string' && (VOCATION_IDS as readonly string[]).includes(v);
}
