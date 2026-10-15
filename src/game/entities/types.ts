// Entidades em tempo de execução da simulação (independentes de engine).
import type { ShieldTrainingState } from '../../domain/rules/shielding';
import type { EventBus } from '../../domain/events/EventBus';
import type { GameEventMap } from '../../domain/events/gameEvents';
import type { HeroDef } from '../../domain/entities/definitions';
import type { UiState } from '../simulation/World';
import type { HeroBrainState } from '../ai/heroBrain';
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
  /** Último ataque do jogador (golpe ou magia ofensiva) — exigido para treinar Shielding. */
  lastAttackAt: number;
  shieldTraining: ShieldTrainingState;
  /** Contexto próprio do ator: estado de janelas (diálogo/loja/loot) e barramento de eventos. */
  scope: ActorScope;
}

export interface ActorScope {
  ui: UiState;
  events: EventBus<GameEventMap>;
}

/** Herói: um personagem-jogador controlado pela IA (mesmas regras e sistemas do jogador). */
export interface HeroEntity extends PlayerEntity {
  hero: HeroDef;
  brain: HeroBrainState;
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
  /** Ator (jogador ou herói) que o monstro está perseguindo/atacando. */
  targetId: string | null;
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
