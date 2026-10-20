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
import { newShieldTraining } from '../../domain/rules/shielding';
import { chebyshev } from '../../domain/value-objects/position';
import { isPz, isSolid } from '../world/GameMap';
import type { GameMap } from '../world/GameMap';
import type { HeroDef } from '../../domain/entities/definitions';
import type { HeroEntity, NpcEntity, PlayerEntity } from '../entities/types';
import { canEnter, isMoving, pathTo, placeOccupant, settle, teleport, tryStep } from '../movement/movement';
import { currentActorTarget, currentTarget, cycleTarget, respawnPlayer, setTarget, updatePlayerCombat, weaponCanReach } from '../combat/combat';
import { castSpell, updateQueuedSpell } from '../abilities/spells';
import { bankGold, depotDeposit, depotDepositAll, depotWithdraw } from '../economy/depotService';
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
import { discardItem, equipItem, takeAllNearbyLoot, takeLoot, takeNearbyGold, unequipSlot, useInventoryItem, useItemById } from '../inventory/inventoryService';
import { buyItem, sellItem, sellAllItems } from '../economy/shopService';
import { refreshStats } from '../progression/progression';
import { nearestReachable, planWalk } from '../movement/walk';
import { setSellLock } from '../../domain/rules/economy';
import { HOTBAR_SIZE, assignHotbar, normalizeHotbar, type HotbarEntry } from '../../domain/rules/hotbar';
import { PARTY_FAIL_MESSAGE, acceptInvite, actorById, configureParty, declineInvite, disbandParty, formationSpot, invite, kickFromParty, leaveParty, loadPk, newSocialState, passLeadership, savePk, updateSocial, type PartySetting } from '../social/social';
import { addHero } from '../ai/heroes';
import { answerInviteNow, heroStatusLine, updateHeroBrain } from '../ai/heroBrain';
import { allActors, asActor, message, warnThrottled, type UiState, type World } from './World';

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
  /** Heróis com vida própria presentes no mundo (personagens não controlados pelo jogador). */
  heroes?: { hero: HeroDef; character: CharacterState }[];
}

/** Membro que segue o líder (formação seguir/fila) e ficou para trás: passo 20–35% mais rápido até alcançar. */
function followCatchUp(w: World, p: PlayerEntity): number {
  const party = w.social.party;
  if (!party || party.formation === 'free' || party.leaderId === p.id || !party.members.includes(p.id) || p.targetId) return 1;
  const leader = actorById(w, party.leaderId);
  if (!leader || leader.dead) return 1;
  const d = Math.max(Math.abs(leader.x - p.x), Math.abs(leader.y - p.y));
  return d > 6 ? 1.35 : d > 2 ? 1.2 : 1;
}

export class GameSimulation {
  readonly world: World;
  private paused = false;

  constructor(opts: SimulationOptions) {
    const rng = opts.rng ?? createRng();
    const c = opts.character;
    const ui: UiState = { dialog: null, shop: null, depot: null, lootId: null, regionId: null, buildingId: null, pending: null };
    const events = new EventBus<GameEventMap>();
    const player: PlayerEntity = {
      id: PLAYER_ID,
      kind: 'player',
      x: opts.map.playerStart.x,
      y: opts.map.playerStart.y,
      facing: c.facing ?? 'down',
      move: null,
      moveEnd: 0,
      stuckSince: 0,
      stuckWith: null,
      stuckAt: 0,
      slowUntil: 0,
      slowFactor: 1,
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
      chasePaused: false,
      lastMoveCommandAt: -Infinity,
      following: false,
      nextRegenAt: 0,
      food: null,
      dead: false,
      invulnerableUntil: 0,
      lastWarningAt: {},
      lastAttackAt: -Infinity,
      shieldTraining: newShieldTraining(),
      queuedSpell: null,
      scope: { ui, events },
    };
    this.world = {
      data: opts.data,
      map: opts.map,
      rng,
      loot: opts.loot ?? createLootGenerator(rng),
      events,
      now: 0,
      player,
      human: player,
      heroes: new Map(),
      social: newSocialState(c.flags.pvp === true),
      monsters: new Map(),
      npcs: new Map(),
      lootBags: new Map(),
      corpses: new Map(),
      occupancy: new Map(),
      doorsOpen: new Map(),
      ui,
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
    loadPk(w, player); // caveira, PZ lock e mortes injustas de sessões anteriores
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
    for (const hc of opts.heroes ?? []) this.addHero(hc.hero, hc.character);
  }

  /** Coloca um herói (personagem com vida própria) no mundo. */
  addHero(hero: HeroDef, character: CharacterState): HeroEntity {
    const w = this.world;
    const h = addHero(w, hero, character);
    asActor(w, h, () => {
      refreshStats(w);
      updateRegion(w);
    });
    return h;
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
    this.tickActor(step);
    // heróis: mesma sequência do jogador, cada um no próprio contexto, guiados pela IA
    for (const h of w.heroes.values())
      asActor(w, h, () => {
        updateHeroBrain(w, h);
        this.tickActor(step);
      });
    for (const m of w.monsters.values()) updateMonster(w, m);
    updateNpcs(w);
    this.updateWorldTimers();
    updateDoors(w);
    updateSocial(w);
  }

  /** Um passo do ator em execução (`w.player`): movimento, combate, regeneração, interações. */
  private tickActor(step: number): void {
    const w = this.world;
    const p = w.player;
    p.character.stats.playTimeMs += step;
    settle(p, w.now);
    this.updatePlayerMovement();
    updatePlayerCombat(w);
    updateQueuedSpell(w);
    this.updateActorTimers();
    updatePendingInteraction(w);
    updateUiDistance(w);
    updateRegion(w);
  }

  private updatePlayerMovement(): void {
    const w = this.world;
    const p = w.player;
    if (p.dead || isMoving(p, w.now)) return;
    // lentidão (gelo) reduz o passo; "seguir o líder" acelera um pouco quem ficou para trás
    const speed = p.stats.speed * followCatchUp(w, p) * (w.now < p.slowUntil ? p.slowFactor : 1);
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
    // em grupo com outro líder (formação seguir/fila), sem alvo e sem caminho escolhido por você: anda junto do líder.
    // O caminho é refeito a cada ~0,25 s enquanto anda (sem parar entre recálculos) e para perto dele.
    if (p === w.human && !p.targetId && (!p.path?.length || p.following) && w.now - p.lastMoveCommandAt > 1200) {
      const spot = formationSpot(w, p.id);
      if (!spot) p.following = false;
      else if (Math.max(Math.abs(spot.x - p.x), Math.abs(spot.y - p.y)) <= spot.tolerance) {
        if (p.following) {
          p.path = null;
          p.pathGoal = null;
          p.following = false;
        }
      } else if (w.now >= p.chaseRecalcAt) {
        p.chaseRecalcAt = w.now + 250;
        const path = pathTo(w, p, spot, false, { stopWithin: spot.tolerance, maxNodes: 4000 });
        if (path?.length) {
          p.path = path;
          p.pathGoal = { ...path[path.length - 1]! };
          p.following = true;
        }
      }
    }
    if (p.path && !p.path.length) {
      p.path = null;
      p.pathGoal = null;
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
      // viagem longa (mini mapa) replaneja com mais fôlego; caminho curto, barato
      const far = goal ? Math.max(Math.abs(goal.x - p.x), Math.abs(goal.y - p.y)) > 30 : false;
      p.path = goal ? pathTo(w, p, goal, false, { stopWithin: w.ui.pending ? 1 : 0, maxNodes: far ? 120000 : 2500 }) : null;
      if (!p.path) p.pathGoal = null;
      return;
    }
    // perseguição automática do alvo quando fora de alcance (desligada no modo "atacar parado")
    const t = currentTarget(w) ?? currentActorTarget(w);
    const stand = p.character.flags.standAttack === true;
    if (t && !stand && !p.chasePaused && !weaponCanReach(w, t) && !isPz(w.map, p.x, p.y) && w.now >= p.chaseRecalcAt) {
      p.chaseRecalcAt = w.now + 350;
      const stop = p.stats.weapon.range <= 1 ? 1 : Math.max(1, p.stats.weapon.range - 1);
      const path = pathTo(w, p, { x: t.x, y: t.y }, false, { stopWithin: stop, maxNodes: 1500 });
      if (path && path.length) {
        const next = path[0]!;
        tryStep(w, p, next.x - p.x, next.y - p.y, speed, false);
      }
    }
  }

  private updateActorTimers(): void {
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
  }

  private updateWorldTimers(): void {
    const w = this.world;
    // decomposição de corpos e loot
    for (const [id, corpse] of w.corpses) if (corpse.expiresAt <= w.now) w.corpses.delete(id);
    for (const [id, bag] of w.lootBags)
      if (bag.expiresAt <= w.now) {
        w.lootBags.delete(id);
        for (const a of allActors(w)) if (a.scope.ui.lootId === id) a.scope.ui.lootId = [...w.lootBags.values()].find((b) => Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) <= 1)?.id ?? null;
        w.events.emit('lootChanged', { containerId: id });
      }
  }

  // ------------------------------------------------------------------ comandos (entrada do jogador)
  /** Vetor analógico (-1..1) do joystick/teclado; (0,0) para soltar. */
  setMoveVector(x: number, y: number): void {
    this.world.player.heldDir = vectorToDir(x, y);
  }
  setMoveDir(dir: DirVector | null): void {
    const p = this.world.player;
    p.heldDir = dir;
    if (dir) this.manualMove();
  }
  /** Caminha até o tile (clique/toque no chão). Andar por conta própria pausa a perseguição do alvo. */
  walkTo(x: number, y: number): boolean {
    const ok = planWalk(this.world, x, y);
    if (ok) this.manualMove();
    return ok;
  }
  /** Viagem longa (toque no mini mapa): caminho pelo mapa todo, contornando monstros quando dá. */
  travelTo(x: number, y: number): boolean {
    // vai até o ponto alcançável mais perto do toque (margem do lago, cerca, porta...)
    const t = nearestReachable(this.world, x, y) ?? { x, y };
    const ok = planWalk(this.world, t.x, t.y, { maxNodes: 120000, avoidMonsters: true });
    if (ok) this.manualMove();
    return ok;
  }
  private manualMove(): void {
    const p = this.world.player;
    p.lastMoveCommandAt = this.world.now;
    p.following = false;
    if (p.targetId) p.chasePaused = true;
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
  /** Compacta a mochila sem alterar a ordem relativa dos itens. */
  organizeInventory(): void {
    const inv = this.world.player.character.inventory;
    const filled = inv.filter((s): s is NonNullable<typeof s> => s !== null);
    inv.splice(0, inv.length, ...filled, ...Array.from({ length: inv.length - filled.length }, () => null));
    this.world.events.emit('itemsChanged', {});
    this.world.events.emit('saveRequested', { reason: 'inventory' });
  }
  /** Coleta da janela de loot: 'all' (todos os sacos ao redor), 'gold' ou um item de um saco específico. */
  takeLoot(which: 'all' | 'gold' | { bagId: string; index: number }): void {
    if (!this.world.ui.lootId) return;
    if (which === 'all') takeAllNearbyLoot(this.world);
    else if (which === 'gold') takeNearbyGold(this.world);
    else takeLoot(this.world, which.bagId, which.index);
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
  closeDepot(): void {
    this.world.ui.depot = null;
  }
  depotDeposit(invIndex: number): boolean {
    return depotDeposit(this.world, invIndex);
  }
  depotWithdraw(depotIndex: number): boolean {
    return depotWithdraw(this.world, depotIndex);
  }
  depotDepositAll(): boolean {
    return depotDepositAll(this.world);
  }
  bankGold(op: 'deposit' | 'withdraw', amount: number): boolean {
    return bankGold(this.world, op, amount);
  }
  buy(itemId: string, qty: number): boolean {
    return buyItem(this.world, itemId, qty);
  }
  sell(itemId: string, qty: number): boolean {
    return sellItem(this.world, itemId, qty);
  }
  sellAll(): boolean {
    return sellAllItems(this.world);
  }
  /** Trava/destrava a venda de um item (fica fora do "vender tudo"). */
  setSellLock(itemId: string, locked: boolean): void {
    const w = this.world;
    const def = w.data.items[itemId];
    if (!def) return;
    setSellLock(w.player.character, itemId, locked);
    message(w, locked ? `${def.name}: venda travada (não entra no "Vender tudo").` : `${def.name}: venda destravada.`, 'system');
    w.events.emit('itemsChanged', {});
    w.events.emit('saveRequested', { reason: 'lock' });
  }
  respawn(): void {
    respawnPlayer(this.world);
  }

  // ------------------------------------------------------------------ grupo, PK e modo de ataque
  /** Convida um personagem para o grupo (quem convida vira o líder ao formar o grupo). */
  partyInvite(toId: string): boolean {
    const w = this.world;
    const fail = invite(w, w.player.id, toId);
    if (fail) warnThrottled(w, `party:${fail}`, PARTY_FAIL_MESSAGE[fail], 600);
    // herói responde na hora (sem precisar insistir)
    const hero = w.heroes.get(toId);
    if (!fail && hero) asActor(w, hero, () => answerInviteNow(w, hero));
    return !fail;
  }
  partyAccept(): boolean {
    const w = this.world;
    const fail = acceptInvite(w, w.player.id);
    if (fail) warnThrottled(w, `party:${fail}`, PARTY_FAIL_MESSAGE[fail], 600);
    return !fail;
  }
  partyDecline(): void {
    declineInvite(this.world, this.world.player.id);
  }
  partyLeave(): void {
    leaveParty(this.world, this.world.player.id);
  }
  partyKick(id: string): void {
    const w = this.world;
    const fail = kickFromParty(w, w.player.id, id);
    if (fail) warnThrottled(w, `party:${fail}`, PARTY_FAIL_MESSAGE[fail], 600);
  }
  /** Escolhe o líder do grupo (qualquer membro, inclusive você de volta). Os outros membros são heróis com
   * vida própria e aceitam o que o jogador decide no painel do grupo. */
  partyPassLeader(id: string): void {
    const w = this.world;
    const party = w.social.party;
    const asLeader = party && party.members.includes(w.player.id) ? party.leaderId : w.player.id;
    const fail = party?.leaderId === id ? null : passLeadership(w, asLeader, id);
    if (fail) warnThrottled(w, `party:${fail}`, PARTY_FAIL_MESSAGE[fail], 600);
  }
  configureParty(patch: PartySetting): void {
    const w = this.world;
    const party = w.social.party;
    const asLeader = party && party.members.includes(w.player.id) ? party.leaderId : w.player.id;
    const fail = configureParty(w, asLeader, patch);
    if (fail) warnThrottled(w, `party:${fail}`, PARTY_FAIL_MESSAGE[fail], 600);
  }
  disbandParty(): void {
    const w = this.world;
    const fail = disbandParty(w, w.player.id);
    if (fail) warnThrottled(w, `party:${fail}`, PARTY_FAIL_MESSAGE[fail], 600);
  }
  /** Permissão de PK (ataque entre personagens). Desligar encerra os ataques em andamento. */
  setPvp(on: boolean): void {
    const w = this.world;
    w.social.pvp = on;
    w.human.character.flags.pvp = on;
    if (!on) for (const a of allActors(w)) if (a.targetId && !w.monsters.has(a.targetId)) a.targetId = null;
    message(w, on ? 'PK ativado: personagens podem se atacar fora das áreas protegidas.' : 'PK desativado.', on ? 'warning' : 'system');
    w.events.emit('socialChanged', {});
  }
  /** Modo de ataque: parado (não persegue o alvo) ou seguindo o alvo. */
  setStandAttack(stand: boolean): void {
    const c = this.world.player.character;
    c.flags.standAttack = stand;
    message(this.world, stand ? 'Modo de ataque: parado (não persegue o alvo).' : 'Modo de ataque: seguir o alvo.', 'system');
    this.world.events.emit('socialChanged', {});
  }
  /** Fala do herói tocado (o que ele está fazendo). */
  talkTo(id: string): void {
    const w = this.world;
    const hero = w.heroes.get(id);
    if (hero) asActor(w, hero, () => heroStatusLine(w, hero));
  }
  /** Vincula uma magia, item ou poção automática a um atalho (se já estava em outro, troca de lugar). */
  setHotbar(index: number, entry: HotbarEntry): void {
    const c = this.world.player.character;
    if (c.hotbar.length !== HOTBAR_SIZE) c.hotbar = normalizeHotbar(this.world.data, c.vocation, c.hotbar);
    assignHotbar(c.hotbar, index, entry);
    this.world.events.emit('saveRequested', { reason: 'hotbar' });
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
    savePk(this.world, p);
    return structuredClone(c);
  }
}
