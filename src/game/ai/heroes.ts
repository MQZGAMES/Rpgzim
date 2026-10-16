// Criação dos heróis e do "contexto" deles: cada herói tem o próprio estado de janelas e um barramento
// de eventos. Do barramento dele, só o que o mundo deve ver/ouvir segue para o barramento principal
// (golpes, dano, magias, mortes, loot, falas); mensagens e avisos da interface ficam com o herói.
import type { CharacterState } from '../../domain/entities/character';
import type { HeroDef } from '../../domain/entities/definitions';
import { EventBus } from '../../domain/events/EventBus';
import type { GameEventMap } from '../../domain/events/gameEvents';
import { computeStats } from '../../domain/rules/stats';
import { newShieldTraining } from '../../domain/rules/shielding';
import { SKILL_LABEL } from '../../domain/entities/definitions';
import type { HeroEntity } from '../entities/types';
import type { UiState, World } from '../simulation/World';
import { asActor } from '../simulation/World';
import { canEnter, placeOccupant } from '../movement/movement';
import { freeCellNear } from '../movement/walk';
import { heroOnEvent, newHeroBrain } from './heroBrain';

export const heroEntityId = (heroId: string) => `hero:${heroId}`;

const FORWARD = ['damage', 'heal', 'attack', 'missed', 'spellCast', 'entityDied', 'lootDropped', 'lootChanged', 'buffApplied', 'speech'] as const;

function heroBus(w: World, h: HeroEntity, main: EventBus<GameEventMap>): EventBus<GameEventMap> {
  const bus = new EventBus<GameEventMap>();
  for (const type of FORWARD) bus.on(type, (e) => main.emit(type, e as never));
  bus.on('xpGained', (e) => {
    main.emit('actorFx', { entityId: h.id, text: `+${e.amount} XP`, tone: 'xp' });
    heroOnEvent(w, h, 'xp', { amount: e.amount });
  });
  bus.on('playerDied', (e) => heroOnEvent(w, h, 'killedBy', { sourceId: e.killerId, sourceName: e.killerName, byPlayer: e.byPlayer }));
  bus.on('levelUp', (e) => {
    main.emit('actorFx', { entityId: h.id, text: `NIVEL ${e.level}!`, tone: 'level' });
    asActor(w, h, () => heroOnEvent(w, h, 'levelUp', { level: e.level }));
  });
  bus.on('skillUp', (e) => {
    main.emit('actorFx', { entityId: h.id, text: 'SKILL UP!', tone: 'skill' });
    asActor(w, h, () => heroOnEvent(w, h, 'skillUp', { skill: SKILL_LABEL[e.skill] }));
  });
  bus.on('damage', (e) => {
    if (e.targetId === h.id && e.sourceId) heroOnEvent(w, h, 'damage', { sourceId: e.sourceId, sourceName: w.monsters.get(e.sourceId)?.def.name ?? w.heroes.get(e.sourceId)?.character.name ?? (e.sourceId === w.human.id ? w.human.character.name : undefined) });
  });
  bus.on('entityDied', (e) => e.kind === 'monster' && heroOnEvent(w, h, 'kill', {}));
  bus.on('playerRespawned', () => main.emit('actorRespawned', { entityId: h.id }));
  bus.on('saveRequested', (e) => main.emit('heroSaveRequested', { heroId: h.hero.id, reason: e.reason }));
  return bus;
}

/** Cria o herói no mundo (posição salva se livre; senão perto do templo). */
export function addHero(w: World, hero: HeroDef, character: CharacterState, restorePosition = true): HeroEntity {
  const ui: UiState = { dialog: null, shop: null, depot: null, lootId: null, regionId: null, buildingId: null, pending: null };
  const h = {
    id: heroEntityId(hero.id),
    kind: 'player',
    x: w.map.playerStart.x,
    y: w.map.playerStart.y,
    facing: character.facing ?? 'down',
    move: null,
    moveEnd: 0,
    character,
    stats: computeStats(w.data, character),
    buffs: [],
    cooldowns: {},
    targetId: null,
    nextAttackAt: 0,
    heldDir: null,
    path: null,
    pathGoal: null,
    chaseRecalcAt: 0,
    nextRegenAt: 0,
    food: null,
    dead: false,
    invulnerableUntil: 0,
    lastWarningAt: {},
    lastAttackAt: -Infinity,
    shieldTraining: newShieldTraining(),
    queuedSpell: null,
    scope: { ui, events: new EventBus<GameEventMap>() },
    hero,
    brain: newHeroBrain(),
  } satisfies HeroEntity as HeroEntity;
  h.scope.events = heroBus(w, h, w.human.scope.events);
  const pos = character.position;
  const spot = restorePosition && pos && canEnter(w, pos.x, pos.y, false, h.id) ? pos : freeCellNear(w, w.map.playerStart.x, w.map.playerStart.y + 2, h.id, 6);
  h.x = spot.x;
  h.y = spot.y;
  if (character.health <= 0) {
    character.health = h.stats.maxHealth;
    character.mana = h.stats.maxMana;
  }
  placeOccupant(w, h);
  w.heroes.set(h.id, h);
  return h;
}

/** Estado salvável do herói (posição e orientação atualizadas). */
export function heroSnapshot(h: HeroEntity): CharacterState {
  const c = h.character;
  c.position = { x: h.x, y: h.y };
  c.facing = h.facing;
  c.updatedAt = Date.now();
  return structuredClone(c);
}
