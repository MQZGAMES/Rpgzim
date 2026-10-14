// Estado completo do mundo simulado + serviços compartilhados pelos sistemas.
// Nada aqui depende de Phaser ou React: a mesma estrutura poderia rodar num servidor autoritativo.
import type { GameData } from '../../domain/entities/gameData';
import type { EventBus } from '../../domain/events/EventBus';
import type { GameEventMap, MessageKind } from '../../domain/events/gameEvents';
import type { Rng } from '../../domain/value-objects/rng';
import type { LootGenerator } from '../../domain/rules/loot';
import type { GameMap } from '../world/GameMap';
import type { Corpse, LootContainer, MonsterEntity, NpcEntity, PlayerEntity } from '../entities/types';

export interface UiState {
  dialog: { npcId: string; pageId: string } | null;
  shop: { shopId: string; npcId: string } | null;
  /** Banco/depósito aberto junto a um NPC banqueiro. */
  depot: { npcId: string } | null;
  lootId: string | null;
  regionId: string | null;
  buildingId: string | null;
  /** Interação pendente: o jogador caminha até o alvo e interage ao chegar. */
  pending: { kind: 'npc' | 'loot' | 'sign'; id: string } | null;
}

export interface World {
  readonly data: GameData;
  readonly map: GameMap;
  readonly rng: Rng;
  readonly loot: LootGenerator;
  readonly events: EventBus<GameEventMap>;
  now: number;
  player: PlayerEntity;
  monsters: Map<string, MonsterEntity>;
  npcs: Map<string, NpcEntity>;
  lootBags: Map<string, LootContainer>;
  corpses: Map<string, Corpse>;
  /** Célula -> id da entidade que a ocupa. */
  occupancy: Map<number, string>;
  doorsOpen: Map<string, boolean>;
  ui: UiState;
  seq: number;
  nextDoorCheckAt: number;
}

export function nextId(w: World, prefix: string): string {
  w.seq += 1;
  return `${prefix}${w.seq}`;
}

export function message(w: World, text: string, kind: MessageKind = 'info'): void {
  w.events.emit('message', { text, kind });
}

/** Aviso com limitação de frequência (evita spam de "sem mana" a cada quadro). */
export function warnThrottled(w: World, key: string, text: string, everyMs = 1500): void {
  const last = w.player.lastWarningAt[key] ?? -Infinity;
  if (w.now - last < everyMs) return;
  w.player.lastWarningAt[key] = w.now;
  w.events.emit('actionFailed', { reason: key, message: text });
}
