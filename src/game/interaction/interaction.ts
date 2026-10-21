// Interações por proximidade: portas automáticas, NPCs (diálogo/loja), placas e sacos de loot.
// Também detecta mudança de região e de construção (para a interface e para o telhado).
import { chebyshev } from '../../domain/value-objects/position';
import { buildingAt, regionAt } from '../world/GameMap';
import type { World } from '../simulation/World';
import { allActors, message } from '../simulation/World';
import { isMoving, pathTo, settle, teleport, tryStep } from '../movement/movement';
import { freeCellNear } from '../movement/walk';
import { setTarget } from '../combat/combat';

export const NPC_RANGE = 2;
export const LOOT_RANGE = 1;

export type Interactable = { kind: 'npc' | 'loot' | 'sign'; id: string; label: string; distance: number };

/** Lista o que está ao alcance do jogador, do mais próximo ao mais distante. */
export function nearbyInteractables(w: World): Interactable[] {
  const p = w.player;
  const out: Interactable[] = [];
  for (const n of w.npcs.values()) {
    const d = chebyshev(n, p);
    if (d <= NPC_RANGE) out.push({ kind: 'npc', id: n.id, label: `Falar com ${n.def.name}`, distance: d });
  }
  for (const l of w.lootBags.values()) {
    const d = chebyshev(l, p);
    if (d <= LOOT_RANGE) out.push({ kind: 'loot', id: l.id, label: 'Abrir loot', distance: d - 0.5 });
  }
  w.map.signs.forEach((s, i) => {
    const d = chebyshev(s, p);
    if (d <= 1) out.push({ kind: 'sign', id: String(i), label: 'Ler placa', distance: d });
  });
  return out.sort((a, b) => a.distance - b.distance);
}

export function interactWith(w: World, target: { kind: 'npc' | 'loot' | 'sign'; id: string }): void {
  const p = w.player;
  if (p.dead) return;
  if (target.kind === 'npc') {
    const n = w.npcs.get(target.id);
    if (!n) return;
    if (chebyshev(n, p) > NPC_RANGE) return walkThenInteract(w, n, target);
    n.facing = Math.abs(p.x - n.x) >= Math.abs(p.y - n.y) ? (p.x < n.x ? 'left' : 'right') : p.y < n.y ? 'up' : 'down';
    w.ui.dialog = { npcId: n.id, pageId: n.def.dialog[0]!.id };
    w.ui.shop = null;
    w.ui.depot = null;
    w.ui.lootId = null;
    w.events.emit('dialogOpened', { npcId: n.id });
  } else if (target.kind === 'loot') {
    const l = w.lootBags.get(target.id);
    if (!l) return;
    if (chebyshev(l, p) > LOOT_RANGE) return walkThenInteract(w, l, target);
    w.ui.lootId = l.id;
    w.ui.dialog = null;
    w.ui.shop = null;
    w.ui.depot = null;
    w.events.emit('lootChanged', { containerId: l.id });
  } else {
    const s = w.map.signs[Number(target.id)];
    if (!s) return;
    if (chebyshev(s, p) > 1) return walkThenInteract(w, s, target);
    message(w, `Placa: "${s.text}"`, 'system');
  }
}

function walkThenInteract(w: World, pos: { x: number; y: number }, target: { kind: 'npc' | 'loot' | 'sign'; id: string }): void {
  const p = w.player;
  // NPCs atrás de balcões: basta chegar ao alcance da conversa (2 tiles); tenta antes o tile colado
  const path =
    target.kind === 'npc'
      ? (pathTo(w, p, { x: pos.x, y: pos.y }, false, { stopWithin: 1, maxNodes: 1500 }) ?? pathTo(w, p, { x: pos.x, y: pos.y }, false, { stopWithin: NPC_RANGE }))
      : pathTo(w, p, { x: pos.x, y: pos.y }, false, { stopWithin: 1 });
  if (!path) {
    message(w, 'Não há caminho até lá.', 'warning');
    return;
  }
  p.path = path;
  p.pathGoal = { x: pos.x, y: pos.y };
  w.ui.pending = target;
}

/** Interage com o elemento mais próximo (botão de ação / tecla E). */
export function interactNearest(w: World): boolean {
  const list = nearbyInteractables(w);
  const first = list[0];
  if (!first) return false;
  interactWith(w, first);
  return true;
}

export function updatePendingInteraction(w: World): void {
  const pend = w.ui.pending;
  if (!pend) return;
  const p = w.player;
  const pos = pend.kind === 'npc' ? w.npcs.get(pend.id) : pend.kind === 'loot' ? w.lootBags.get(pend.id) : w.map.signs[Number(pend.id)];
  if (!pos) {
    w.ui.pending = null;
    return;
  }
  const range = pend.kind === 'npc' ? NPC_RANGE : 1;
  if (chebyshev(pos, p) <= range && !isMoving(p, w.now)) {
    w.ui.pending = null;
    p.path = null;
    interactWith(w, pend);
  } else if (!p.path && !isMoving(p, w.now)) {
    w.ui.pending = null;
  }
}

/** Fecha diálogos/lojas/loot quando o jogador se afasta. */
export function updateUiDistance(w: World): void {
  const p = w.player;
  const npcId = w.ui.dialog?.npcId ?? w.ui.shop?.npcId ?? w.ui.depot?.npcId;
  if (npcId) {
    const n = w.npcs.get(npcId);
    if (!n || chebyshev(n, p) > NPC_RANGE + 1) {
      w.ui.dialog = null;
      w.ui.shop = null;
      w.ui.depot = null;
    }
  }
  if (w.ui.lootId) {
    // a janela mostra todos os sacos ao redor; fecha quando não sobra nenhum ao alcance
    const near = [...w.lootBags.values()].filter((l) => chebyshev(l, p) <= LOOT_RANGE);
    if (!near.length) w.ui.lootId = null;
    else if (!near.some((l) => l.id === w.ui.lootId)) w.ui.lootId = near[0]!.id;
  }
}

export function chooseDialogOption(w: World, index: number): void {
  const d = w.ui.dialog;
  if (!d) return;
  const npc = w.npcs.get(d.npcId);
  if (!npc) return;
  const page = npc.def.dialog.find((pg) => pg.id === d.pageId);
  const opt = page?.options[index];
  if (!opt) return;
  switch (opt.action) {
    case 'close':
      w.ui.dialog = null;
      break;
    case 'next':
      if (opt.goto) w.ui.dialog = { npcId: npc.id, pageId: opt.goto };
      break;
    case 'openShop':
      if (npc.def.shopId) {
        w.ui.dialog = null;
        w.ui.shop = { shopId: npc.def.shopId, npcId: npc.id };
        w.events.emit('shopOpened', { shopId: npc.def.shopId, npcId: npc.id });
      }
      break;
    case 'openDepot':
      w.ui.dialog = null;
      w.ui.depot = { npcId: npc.id };
      w.events.emit('depotOpened', { npcId: npc.id });
      break;
    case 'travel': {
      const dest = opt.travelTo ? [...w.npcs.values()].find((n) => n.def.id === opt.travelTo) : undefined;
      if (!dest) break;
      const c = w.player.character;
      if (opt.minLevel && c.level < opt.minLevel) {
        message(w, `${npc.def.name}: "O caminho até lá é perigoso demais. Volte no nível ${opt.minLevel}."`, 'warning');
        break;
      }
      const price = opt.price ?? 0;
      if (price > c.gold) {
        message(w, `${npc.def.name}: "A travessia custa ${price} de ouro."`, 'warning');
        break;
      }
      c.gold -= price;
      const spot = freeCellNear(w, dest.x, dest.y + 2, w.player.id, 4);
      teleport(w, w.player, spot.x, spot.y);
      w.player.path = null;
      w.player.pathGoal = null;
      w.player.following = false;
      setTarget(w, null);
      w.ui.dialog = null;
      message(w, `Você atravessou o portal até ${dest.def.title}.`, 'system');
      w.events.emit('actorFx', { entityId: w.player.id, text: 'PORTAL', tone: 'level' });
      break;
    }
    case 'heal': {
      const c = w.player.character;
      c.health = w.player.stats.maxHealth;
      c.mana = w.player.stats.maxMana;
      w.events.emit('heal', { targetId: w.player.id, amount: 0, mana: false, position: { x: w.player.x, y: w.player.y } });
      message(w, `${npc.def.name}: "Que a luz da Aurora o restaure."`, 'system');
      w.ui.dialog = null;
      break;
    }
  }
}

/** Portas abrem automaticamente quando alguém está a 1 tile. */
export function updateDoors(w: World): void {
  if (w.now < w.nextDoorCheckAt) return;
  w.nextDoorCheckAt = w.now + 100;
  const movers = [...allActors(w), ...w.npcs.values()];
  for (const d of w.map.doors) {
    const near = movers.some((m) => {
      if (m.x === d.x) return m.y >= d.y - 2 && m.y <= d.y + 1; // de frente, na soleira ou logo dentro
      return Math.abs(m.x - d.x) === 1 && m.y === d.y - 2; // dentro, ao lado da porta
    });
    const was = w.doorsOpen.get(d.id) ?? false;
    if (near !== was) {
      w.doorsOpen.set(d.id, near);
      w.events.emit('doorChanged', { doorId: d.id, open: near });
    }
  }
}

export function updateRegion(w: World): void {
  const p = w.player;
  const r = regionAt(w.map, p.x, p.y);
  const rid = r?.id ?? null;
  if (rid !== w.ui.regionId) {
    w.ui.regionId = rid;
    if (r) w.events.emit('regionEntered', { regionId: r.id, name: r.name });
  }
  const b = buildingAt(w.map, p.x, p.y);
  const bid = b?.id ?? null;
  if (bid !== w.ui.buildingId) {
    w.ui.buildingId = bid;
    w.events.emit('buildingChanged', { buildingId: bid });
  }
}

/** NPCs passeiam devagar sem sair da construção/área de origem. */
export function updateNpcs(w: World): void {
  for (const n of w.npcs.values()) {
    settle(n, w.now);
    if (n.def.wanderRadius <= 0 || isMoving(n, w.now) || w.now < n.nextWanderAt) continue;
    if (allActors(w).some((a) => a.scope.ui.dialog?.npcId === n.id || a.scope.ui.shop?.npcId === n.id || a.scope.ui.depot?.npcId === n.id)) continue;
    n.nextWanderAt = w.now + 2500 + w.rng.next() * 4000;
    const dx = w.rng.int(-1, 1);
    const dy = w.rng.int(-1, 1);
    const nx = n.x + dx;
    const ny = n.y + dy;
    if (Math.abs(nx - n.homeX) > n.def.wanderRadius || Math.abs(ny - n.homeY) > n.def.wanderRadius) continue;
    if (buildingAt(w.map, nx, ny)?.id !== buildingAt(w.map, n.homeX, n.homeY)?.id) continue;
    // NPCs não ficam parados em portas
    if (w.map.doors.some((d) => d.x === nx && (d.y === ny || d.y - 1 === ny))) continue;
    tryStep(w, n, dx, dy, 1.6, false);
  }
}
