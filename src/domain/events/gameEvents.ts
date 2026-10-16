// Catálogo de eventos de jogo. Payloads contêm apenas dados serializáveis (prontos para trafegar em rede no futuro).
import type { Element } from '../value-objects/element';
import type { TilePos } from '../value-objects/position';
import type { SkillId } from '../entities/definitions';

export type MessageKind = 'info' | 'warning' | 'loot' | 'combat' | 'system' | 'levelup' | 'chat';

export interface GameEventMap extends Record<string, unknown> {
  damage: { targetId: string; sourceId: string | null; amount: number; element: Element; blocked: boolean; position: TilePos };
  heal: { targetId: string; amount: number; mana: boolean; position: TilePos };
  attack: { sourceId: string; targetId: string; kind: 'melee' | 'distance' | 'wand'; element: Element; projectile?: string; from: TilePos; to: TilePos };
  missed: { sourceId: string; targetId: string; position: TilePos };
  spellCast: { casterId: string; spellId: string; words: string; from: TilePos; targetId: string | null; tiles: TilePos[] };
  actionFailed: { reason: string; message: string };
  entityDied: { entityId: string; kind: 'player' | 'monster'; position: TilePos; spriteKey: string };
  entitySpawned: { entityId: string };
  /** Monstro desistiu da perseguição e voltou por teleporte ao ponto de origem. */
  monsterReturned: { entityId: string; from: TilePos; to: TilePos };
  xpGained: { amount: number; position: TilePos };
  levelUp: { level: number };
  skillUp: { skill: SkillId; level: number };
  lootDropped: { containerId: string; position: TilePos };
  lootChanged: { containerId: string };
  itemsChanged: Record<string, never>;
  goldChanged: { amount: number; delta: number };
  message: { text: string; kind: MessageKind };
  dialogOpened: { npcId: string };
  shopOpened: { shopId: string; npcId: string };
  depotOpened: { npcId: string };
  doorChanged: { doorId: string; open: boolean };
  regionEntered: { regionId: string; name: string };
  buildingChanged: { buildingId: string | null };
  playerDied: { xpLost: number; killerId?: string; killerName?: string; byPlayer?: boolean };
  playerRespawned: Record<string, never>;
  buffApplied: { targetId: string; kind: string; durationMs: number };
  targetChanged: { targetId: string | null };
  itemUsed: { itemId: string };
  saveRequested: { reason: string };
  // ---- heróis (personagens com vida própria)
  /** Fala de um personagem (balão acima da cabeça e registro de mensagens quando perto do jogador). */
  speech: { entityId: string; name: string; text: string; position: TilePos };
  /** Texto flutuante de um ator que não é o jogador (subiu de nível, skill, XP). */
  actorFx: { entityId: string; text: string; tone: 'level' | 'skill' | 'xp' };
  actorRespawned: { entityId: string };
  /** Um herói pediu para salvar o próprio progresso. */
  heroSaveRequested: { heroId: string; reason: string };
  // ---- grupo e PK
  partyInvite: { fromId: string; toId: string; fromName: string; toName: string };
  partyChanged: Record<string, never>;
  socialChanged: Record<string, never>;
}
