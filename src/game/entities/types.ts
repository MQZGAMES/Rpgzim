// Entidades em tempo de execução da simulação (independentes de engine).
import type { CharacterState, ItemStack } from '../../domain/entities/character';
import type { MonsterDef, NpcDef } from '../../domain/entities/definitions';
import type { Facing } from '../../domain/value-objects/direction';
import type { DirVector } from '../../domain/value-objects/direction';
import type { TilePos } from '../../domain/value-objects/position';
import type { Cooldowns } from '../../domain/rules/cooldowns';
import type { ActiveBuff, DerivedStats } from '../../domain/rules/stats';

/** Deslocamento em andamento entre dois tiles, com tempo explícito (ms de simulação). */
export interface MoveState {
  fromX: number;
  fromY: number;
  start: number;
  duration: number;
}

export interface Mover {
  id: string;
  /** Tile lógico atual (já é o destino durante um passo). */
  x: number;
  y: number;
  facing: Facing;
  move: MoveState | null;
  /** Fim do último passo (para encadear passos sem micro-pausas). */
  moveEnd: number;
}

export type AiState = 'idle' | 'wandering' | 'chasing' | 'attacking' | 'returning' | 'dead';

export interface PlayerEntity extends Mover {
  kind: 'player';
  character: CharacterState;
  stats: DerivedStats;
  buffs: ActiveBuff[];
  cooldowns: Cooldowns;
  targetId: string | null;
  nextAttackAt: number;
  heldDir: DirVector | null;
  path: TilePos[] | null;
  pathGoal: TilePos | null;
  chaseRecalcAt: number;
  nextRegenAt: number;
  food: { health: number; mana: number; until: number } | null;
  dead: boolean;
  invulnerableUntil: number;
  lastWarningAt: Record<string, number>;
}

export interface MonsterEntity extends Mover {
  kind: 'monster';
  def: MonsterDef;
  spawnId: string;
  homeX: number;
  homeY: number;
  hp: number;
  alive: boolean;
  state: AiState;
  nextAttackAt: number;
  nextThinkAt: number;
  nextWanderAt: number;
  slowUntil: number;
  slowFactor: number;
  respawnAt: number;
  path: TilePos[] | null;
  pathAt: number;
}

export interface NpcEntity extends Mover {
  kind: 'npc';
  def: NpcDef;
  homeX: number;
  homeY: number;
  nextWanderAt: number;
}

export interface LootContainer {
  id: string;
  x: number;
  y: number;
  items: ItemStack[];
  gold: number;
  expiresAt: number;
  sourceName: string;
}

export interface Corpse {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  facing: Facing;
  expiresAt: number;
}
