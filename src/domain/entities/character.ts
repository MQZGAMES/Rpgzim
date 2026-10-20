// Estado persistente do personagem (o que é salvo). Valores derivados (vida máxima, ataque etc.)
// são sempre recalculados a partir deste estado + definições, nunca gravados.
import type { EquipSlot, SkillId } from './definitions';
import type { Facing } from '../value-objects/direction';
import type { ItemId, VocationId } from '../value-objects/ids';

export interface ItemStack {
  itemId: ItemId;
  count: number;
}

export interface SkillState {
  level: number;
  /** Tentativas acumuladas (para Magic Level: mana gasta) rumo ao próximo nível. */
  tries: number;
}

export interface CharacterState {
  id: string;
  name: string;
  vocation: VocationId;
  level: number;
  /** Experiência total acumulada. */
  experience: number;
  health: number;
  mana: number;
  skills: Record<SkillId, SkillState>;
  /** Mochila com capacidade fixa: null = espaço vazio. */
  inventory: (ItemStack | null)[];
  equipment: Partial<Record<EquipSlot, ItemStack>>;
  gold: number;
  /** Depósito do banco (capacidade fixa): itens guardados com segurança. */
  depot: (ItemStack | null)[];
  /** Ouro guardado no banco. */
  bankGold: number;
  position: { x: number; y: number };
  facing: Facing;
  /** Barra de atalhos de magias (ids). */
  hotbar: string[];
  flags: Record<string, boolean>;
  /** Estado de PK (caveira, PZ lock, mortes injustas), em tempo real para valer entre sessões. */
  pk?: { skull: 'white' | 'yellow' | 'red' | null; skullUntil: number; pzLockUntil: number; unjust: number[] };
  stats: { monstersKilled: number; deaths: number; playTimeMs: number };
  createdAt: number;
  updatedAt: number;
}
