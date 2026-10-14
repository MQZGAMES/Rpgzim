// Orquestrador da simulação. Recebe comandos de entrada (de qualquer fonte: teclado, toque, testes,
// futuramente rede), avança o mundo com passos de tempo limitados e publica eventos tipados.
import type { CharacterState } from '../../domain/entities/character';
import type { EquipSlot } from '../../domain/entities/definitions';
import type { GameData } from '../../domain/entities/gameData';
import { EventBus } from '../../domain/events/EventBus';
import type { GameEventMap } from '../../domain/events/gameEvents';
import { vectorToDir, type DirVector } from '../../domain/value-objects/direction';
import { PLAYER_ID } from '../../domain/value-objects/ids';
import { createRng, type Rng } from '../../domain/value-objects/rng';
import { createLootGenerator, type LootGenerator } from '../../domain/rules/loot';
import { computeStats } from '../../domain/rules/stats';
import { chebyshev } from '../../domain/value-objects/position';
import { isPz, isSolid } from '../world/GameMap';
import type { GameMap } from '../world/GameMap';
import type { NpcEntity, PlayerEntity } from '../entities/types';
import { canEnter, isMoving, pathTo, placeOccupant, settle, teleport, tryStep } from '../movement/movement';
import { currentTarget, cycleTarget, respawnPlayer, setTarget, updatePlayerCombat, weaponCanReach } from '../combat/combat';
import { castSpell } from '../abilities/spells';
import { createMonster, findSpawnCell, updateMonster } from '../ai/monsterAi';
import {
  chooseDialogOption,
  interactNearest,
  interactWith,
  updateDoors,
  updateNpcs,
  updatePendingInteraction,
  updateRegion,
  updateUiDistance,
} from '../interaction/interaction';
import { discardItem, equipItem, takeLoot, unequipSlot, useInventoryItem, useItemById } from '../inventory/inventoryService';
import { buyItem, sellItem } from '../economy/shopService';
import { refreshStats } from '../progression/progression';
import { message, type World } from './World';

export const MAX_STEP_MS = 50;
export const MAX_FRAME_MS = 250;

export interface SimulationOptions {
  data: GameData;
  map: GameMap;
  character: CharacterState;
  rng?: Rng;
  loot?: LootGenerator;
  /** Restaura a posição salva (se válida); caso contrário usa o ponto de nascimento. */
  restorePosition?: boolean;
}

export class GameSimulation {
  readonly world: World;
  private paused = false;

  constructor(opts: SimulationOptions) {
    const rng = opts.rng ?? createRng();
    const c = opts.character;
    const player: PlayerEntity = {
      id: PLAYER_ID,
      kind: 'player',
      x: opts.map.playerStart.x,
      y: opts.map.playerStart.y,
      facing: c.facing ?? 'down',
      move: null,
      moveEnd: 0,
      character: c,
      stats: computeStats(opts.data, c),
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
    };
    this.world = {
      data: opts.data,
      map: opts.map,
      rng,
      loot: opts.loot ?? createLootGenerator(rng),
      events: new EventBus<GameEventMap>(),
      now: 0,
      player,
      monsters: new Map(),
      npcs: new Map(),
      lootBags: new Map(),
      corpses: new Map(),
      occupancy: new Map(),
      doorsOpen: new Map(),
      ui: { dialog: null, shop: null, lootId: null, regionId: null, buildingId: null, pending: null },
      seq: 0,
      nextDoorCheckAt: 0,
    };
    const w = this.world;
    // posição salva válida?
    const pos = c.position;
    if (opts.restorePosition && pos && !isSolid(w.map, pos.x, pos.y)) {
      player.x = pos.x;
      player.y = pos.y;
    }
    placeOccupant(w, player);
    // NPCs
    for (const n of w.map.npcs) {
      const def = w.data.npcs[n.npcId];
      if (!def) continue;
      const npc: NpcEntity = { id: `npc:${n.npcId}`, kind: 'npc', def, x: n.x, y: n.y, homeX: n.x, homeY: n.y, facing: n.facing, move: null, moveEnd: 0, nextWanderAt: 2000 };
      w.npcs.set(npc.id, npc);
      placeOccupant(w, npc);
    }
    // monstros
    for (const s of w.map.spawns) {
      for (let i = 0; i < s.count; i++) {
        const cell = findSpawnCell(w, s.x, s.y, s.radius);
        if (!cell) continue;
        const m = createMonster(w, s.monsterId, s.id, cell.x, cell.y);
        m.homeX = s.x;
        m.homeY = s.y;
        w.monsters.set(m.id, m);
        placeOccupant(w, m);
      }
    }
    refreshStats(w);
    updateRegion(w);
  }

  get events(): EventBus<GameEventMap> {
    return this.world.events;
  }
  get now(): number {
    return this.world.now;
  }
  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.world.player.heldDir = null;
  }

  /** Avança a simulação. Quadros longos são divididos em passos de até 50 ms (comportamento estável em qualquer FPS). */
  update(dtMs: number): void {
    if (this.paused) return;
    let remaining = Math.max(0, Math.min(MAX_FRAME_MS, dtMs));
    while (remaining > 0) {
      const step = Math.min(MAX_STEP_MS, remaining);
      this.tick(step);
      remaining -= step;
    }
  }

  private tick(step: number): void {
    const w = this.world;
    w.now += step;
    const p = w.player;
    p.character.stats.playTimeMs += step;
    settle(p, w.now);
    this.updatePlayerMovement();
    updatePlayerCombat(w);
    for (const m of w.monsters.values()) updateMonster(w, m);
    updateNpcs(w);
    this.updateTimers();
    updateDoors(w);
    updatePendingInteraction(w);
    updateUiDistance(w);
    updateRegion(w);
  }

  private updatePlayerMovement(): void {
    const w = this.world;
    const p = w.player;
    if (p.dead || isMoving(p, w.now)) return;
    const speed = p.stats.speed;
    const dir = p.heldDir;
    if (dir) {
      p.path = null;
      p.pathGoal = null;
      w.ui.pending = null;
      if (tryStep(w, p, dir.dx, dir.dy, speed, false)) return;
      // deslizar ao encostar na diagonal (sensação de controle mais suave)
      if (dir.dx && dir.dy && (tryStep(w, p, dir.dx, 0, speed, false) || tryStep(w, p, 0, dir.dy, speed, false))) return;
      p.facing = dir.dx ? (dir.dx < 0 ? 'left' : 'right') : dir.dy < 0 ? 'up' : 'down';
      return;
    }
    if (p.path && p.path.length) {
      const next = p.path[0]!;
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && tryStep(w, p, dx, dy, speed, false)) {
        p.path.shift();
        return;
      }
      // bloqueado (ex.: monstro no caminho): recalcula até o destino
      const goal = p.pathGoal;
      p.path = goal ? pathTo(w, p, goal, false, { stopWithin: w.ui.pending ? 1 : 0, maxNodes: 2500 }) : null;
      if (!p.path) p.pathGoal = null;
      return;
    }
    // perseguição automática do alvo quando fora de alcance
    const t = currentTarget(w);
    if (t && !weaponCanReach(w, t) && !isPz(w.map, p.x, p.y) && w.now >= p.chaseRecalcAt) {
      p.chaseRecalcAt = w.now + 350;
      const stop = p.stats.weapon.range <= 1 ? 1 : Math.max(1, p.stats.weapon.range - 1);
      const path = pathTo(w, p, { x: t.x, y: t.y }, false, { stopWithin: stop, maxNodes: 1500 });
      if (path && path.length) {
        const next = path[0]!;
        tryStep(w, p, next.x - p.x, next.y - p.y, speed, false);
      }
    }
  }

  private updateTimers(): void {
    const w = this.world;
    const p = w.player;
    const c = p.character;
    // regeneração periódica
    if (!p.dead && w.now >= p.nextRegenAt) {
      p.nextRegenAt = w.now + w.data.balance.player.regenTickMs;
      const voc = w.data.vocations[c.vocation];
      const pzMul = isPz(w.map, p.x, p.y) ? 2 : 1;
      let hp = (voc.regen.health + Math.floor(c.level / 5)) * pzMul;
      let mp = (voc.regen.mana + Math.floor(c.level / 4)) * pzMul;
      if (p.food && w.now < p.food.until) {
        hp += p.food.health;
        mp += p.food.mana;
      } else p.food = null;
      for (const b of p.buffs) if (b.kind === 'regen' && b.expiresAt > w.now) hp += b.value;
      c.health = Math.min(p.stats.maxHealth, c.health + hp);
      c.mana = Math.min(p.stats.maxMana, c.mana + mp);
    }
    // buffs expirados
    if (p.buffs.some((b) => b.expiresAt <= w.now)) {
      p.buffs = p.buffs.filter((b) => b.expiresAt > w.now);
      refreshStats(w);
    }
    // decomposição de corpos e loot
    for (const [id, corpse] of w.corpses) if (corpse.expiresAt <= w.now) w.corpses.delete(id);
    for (const [id, bag] of w.lootBags)
      if (bag.expiresAt <= w.now) {
        w.lootBags.delete(id);
        if (w.ui.lootId === id) w.ui.lootId = null;
        w.events.emit('lootChanged', { containerId: id });
      }
  }

  // ------------------------------------------------------------------ comandos (entrada do jogador)
  /** Vetor analógico (-1..1) do joystick/teclado; (0,0) para soltar. */
  setMoveVector(x: number, y: number): void {
    this.world.player.heldDir = vectorToDir(x, y);
  }
  setMoveDir(dir: DirVector | null): void {
    this.world.player.heldDir = dir;
  }
  /** Caminha até o tile (clique/toque no chão). */
  walkTo(x: number, y: number): boolean {
    const w = this.world;
    const p = w.player;
    if (p.dead) return false;
    w.ui.pending = null;
    const solid = isSolid(w.map, x, y);
    const path = pathTo(w, p, { x, y }, false, { stopWithin: solid ? 1 : 0, maxNodes: 3000 });
    if (!path) {
      message(w, 'Não há caminho até lá.', 'warning');
      return false;
    }
    p.path = path;
    p.pathGoal = { x, y };
    return true;
  }
  stop(): void {
    const p = this.world.player;
    p.path = null;
    p.pathGoal = null;
    p.heldDir = null;
  }
  setTarget(id: string | null): void {
    setTarget(this.world, id);
  }
  cycleTarget(): void {
    cycleTarget(this.world);
  }
  /** Toque numa entidade: alvo (monstro) ou interação (NPC). */
  tapEntity(id: string): void {
    const w = this.world;
    if (w.monsters.has(id)) {
      setTarget(w, w.player.targetId === id ? null : id);
      return;
    }
    if (w.npcs.has(id)) interactWith(w, { kind: 'npc', id });
  }
  tapLoot(id: string): void {
    interactWith(this.world, { kind: 'loot', id });
  }
  interact(): boolean {
    return interactNearest(this.world);
  }
  castSpell(spellId: string): boolean {
    return castSpell(this.world, spellId);
  }
  useItem(index: number): boolean {
    return useInventoryItem(this.world, index);
  }
  useItemById(itemId: string): boolean {
    return useItemById(this.world, itemId);
  }
  equip(index: number): boolean {
    return equipItem(this.world, index);
  }
  unequip(slot: EquipSlot): boolean {
    return unequipSlot(this.world, slot);
  }
  discard(index: number): void {
    discardItem(this.world, index);
  }
  takeLoot(which: number | 'all'): void {
    const id = this.world.ui.lootId;
    if (id) takeLoot(this.world, id, which);
  }
  closeLoot(): void {
    this.world.ui.lootId = null;
  }
  dialogChoose(index: number): void {
    chooseDialogOption(this.world, index);
  }
  closeDialog(): void {
    this.world.ui.dialog = null;
  }
  closeShop(): void {
    this.world.ui.shop = null;
  }
  buy(itemId: string, qty: number): boolean {
    return buyItem(this.world, itemId, qty);
  }
  sell(itemId: string, qty: number): boolean {
    return sellItem(this.world, itemId, qty);
  }
  respawn(): void {
    respawnPlayer(this.world);
  }
  setHotbar(index: number, spellId: string): void {
    const hb = this.world.player.character.hotbar;
    if (index >= 0 && index < 8) hb[index] = spellId;
  }

  // ------------------------------------------------------------------ utilidades para testes/depuração
  teleportPlayer(x: number, y: number): void {
    const w = this.world;
    if (!canEnter(w, x, y, false, w.player.id)) return;
    teleport(w, w.player, x, y);
    updateRegion(w);
  }
  distanceTo(id: string): number {
    const m = this.world.monsters.get(id) ?? this.world.npcs.get(id);
    return m ? chebyshev(m, this.world.player) : Infinity;
  }

  /** Estado persistível atualizado (posição, orientação). */
  snapshotCharacter(): CharacterState {
    const p = this.world.player;
    const c = p.character;
    c.position = { x: p.x, y: p.y };
    c.facing = p.facing;
    c.updatedAt = Date.now();
    return structuredClone(c);
  }
}
