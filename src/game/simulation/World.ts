// Estado completo do mundo simulado + serviços compartilhados pelos sistemas.
// Nada aqui depende de Phaser ou React: a mesma estrutura poderia rodar num servidor autoritativo.
import type { GameData } from '../../domain/entities/gameData';
import type { EventBus } from '../../domain/events/EventBus';
import type { GameEventMap, MessageKind } from '../../domain/events/gameEvents';
import type { Rng } from '../../domain/value-objects/rng';
import type { LootGenerator } from '../../domain/rules/loot';
import type { GameMap } from '../world/GameMap';
import type { SocialState } from '../social/social';
import type { Corpse, HeroEntity, LootContainer, MonsterEntity, NpcEntity, PlayerEntity } from '../entities/types';

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
  /**
   * Barramento do ator em execução. Fora do turno de um herói é o barramento principal (interface,
   * renderização, áudio); durante o turno de um herói é o barramento dele (ver `asActor`).
   */
  events: EventBus<GameEventMap>;
  now: number;
  /**
   * Ator em execução. Os sistemas (combate, magias, mochila, lojas, banco, progressão) agem sobre
   * `player`; fora do turno de um herói é sempre o jogador humano (`human`).
   */
  player: PlayerEntity;
  /** O jogador controlado por pessoa (câmera, interface). */
  readonly human: PlayerEntity;
  /** Heróis com vida própria (mesmas regras do jogador). */
  heroes: Map<string, HeroEntity>;
  /** Grupo, convites, permissão de PK e caveiras. */
  social: SocialState;
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

/** Executa `fn` como se `actor` fosse o jogador: os sistemas existentes passam a agir sobre ele,
 * com o estado de janelas e o barramento de eventos dele. Sempre restaura o contexto anterior. */
export function asActor<R>(w: World, actor: PlayerEntity, fn: () => R): R {
  if (w.player === actor) return fn();
  const prev = { player: w.player, ui: w.ui, events: w.events };
  w.player = actor;
  w.ui = actor.scope.ui;
  w.events = actor.scope.events;
  try {
    return fn();
  } finally {
    w.player = prev.player;
    w.ui = prev.ui;
    w.events = prev.events;
  }
}

/** Todos os personagens-jogadores no mundo (humano + heróis). */
export function allActors(w: World): PlayerEntity[] {
  return w.heroes.size ? [w.human, ...w.heroes.values()] : [w.human];
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
