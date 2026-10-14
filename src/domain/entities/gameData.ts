import type { BalanceConfig, ItemDef, MonsterDef, NpcDef, ShopDef, SpellDef, VocationDef } from './definitions';
import type { VocationId } from '../value-objects/ids';

/** Pacote imutável com todas as definições configuráveis consumidas pelas regras e pela simulação. */
export interface GameData {
  items: Readonly<Record<string, ItemDef>>;
  spells: Readonly<Record<string, SpellDef>>;
  vocations: Readonly<Record<VocationId, VocationDef>>;
  monsters: Readonly<Record<string, MonsterDef>>;
  npcs: Readonly<Record<string, NpcDef>>;
  shops: Readonly<Record<string, ShopDef>>;
  balance: BalanceConfig;
}

export function itemDef(data: GameData, id: string): ItemDef {
  const def = data.items[id];
  if (!def) throw new Error(`Item desconhecido: ${id}`);
  return def;
}
