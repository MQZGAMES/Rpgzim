// API de inspeção para testes automatizados (Playwright) e depuração. Exposta somente em desenvolvimento
// ou com ?debug na URL. Não faz parte da jogabilidade.
import type Phaser from 'phaser';
import type { GameSession } from '../integration/game-ui-bridge/GameSession';

export function installDebugApi(session: GameSession, getGame?: () => Phaser.Game): () => void {
  const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
  if (!enabled) return () => undefined;
  const sim = session.sim;
  // contador de magias/itens disparados (para conferir a repetição por pressão)
  const castLog: { spellId: string; at: number }[] = [];
  const itemLog: { itemId: string; at: number }[] = [];
  const damageLog: { targetId: string; amount: number; blocked: boolean }[] = [];
  const attackLog: { sourceId: string; targetId: string; at: number }[] = [];
  sim.events.on('spellCast', (e) => castLog.push({ spellId: e.spellId, at: sim.world.now }));
  sim.events.on('itemUsed', (e) => itemLog.push({ itemId: e.itemId, at: sim.world.now }));
  sim.events.on('damage', (e) => damageLog.push({ targetId: e.targetId, amount: e.amount, blocked: e.blocked }));
  sim.events.on('attack', (e) => attackLog.push({ sourceId: e.sourceId, targetId: e.targetId, at: sim.world.now }));
  window.__RPGZIM__ = {
    ready: () => session.local.get().ready,
    fps: () => session.local.get().fps,
    player: () => {
      const p = sim.world.player;
      return { x: p.x, y: p.y, hp: p.character.health, mana: p.character.mana, level: p.character.level, xp: p.character.experience, gold: p.character.gold, target: p.targetId, dead: p.dead, ml: p.character.skills.magic, inventory: p.character.inventory.filter(Boolean), equipment: p.character.equipment, vocation: p.character.vocation };
    },
    monsters: () => [...sim.world.monsters.values()].map((m) => ({ id: m.id, type: m.def.id, x: m.x, y: m.y, hp: m.hp, alive: m.alive, state: m.state })),
    npcs: () => [...sim.world.npcs.values()].map((n) => ({ id: n.id, x: n.x, y: n.y })),
    teleport: (x: number, y: number) => sim.teleportPlayer(x, y),
    /** Teleporta para perto (distância `dist`) do monstro vivo mais próximo do tipo indicado e retorna o id dele. */
    teleportNear: (type: string, dist = 2) => {
      const p = sim.world.player;
      const list = [...sim.world.monsters.values()].filter((m) => m.alive && m.def.id === type).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      for (const m of list)
        for (let dy = -dist; dy <= dist; dy++)
          for (let dx = -dist; dx <= dist; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== dist) continue;
            sim.teleportPlayer(m.x + dx, m.y + dy);
            if (p.x === m.x + dx && p.y === m.y + dy && !sim.world.map.pz[p.y * sim.world.map.width + p.x]) return m.id;
          }
      return null;
    },
    idle: () => !sim.world.player.path?.length && !sim.world.player.move,
    target: (id: string) => sim.setTarget(id),
    cast: (id: string) => sim.castSpell(id),
    walkTo: (x: number, y: number) => sim.walkTo(x, y),
    loot: () => [...sim.world.lootBags.values()].map((l) => ({ id: l.id, x: l.x, y: l.y, gold: l.gold, items: l.items })),
    ui: () => ({ ...sim.world.ui }),
    save: () => session.saveNow(),
    openActorMenu: (id: string) => session.tapEntity(id),
    /** Destino do último "andar até" (toque/clique no mapa) e menu de personagem aberto. */
    walkGoal: () => sim.world.player.pathGoal,
    actorMenu: () => session.local.get().actorMenu,
    screenOf: (id: string) => session.screenOf(id),
    stop: () => sim.stop(),
    befriendHeroes: () => {
      for (const h of sim.world.heroes.values()) h.brain.affinity[sim.world.human.id] = 1;
    },
    heroes: () =>
      [...sim.world.heroes.values()].map((h) => ({ id: h.id, name: h.character.name, x: h.x, y: h.y, level: h.character.level, hp: h.character.health, gold: h.character.gold, bankGold: h.character.bankGold, mode: h.brain.mode, quarry: h.brain.quarry, dead: h.dead })),
    buildings: () => sim.world.map.buildings.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, doorX: b.doorX })),
    /** Define a caveira e o PZ lock do jogador (para conferir a interface). */
    setPk: (kind: 'white' | 'yellow' | 'red' | null, lockMs = 0) => {
      const w = sim.world;
      const t = w.social.clock ? w.social.clock() : w.now;
      if (kind) w.social.skulls.set(w.human.id, { kind, until: t + (kind === 'red' ? 24 * 3600000 : 15 * 60000) });
      else w.social.skulls.delete(w.human.id);
      if (lockMs) w.social.pzLocks.set(w.human.id, t + lockMs);
      else w.social.pzLocks.delete(w.human.id);
    },
    /** Dispara um aviso de PK na tela (para conferir a interface). */
    pkNotice: (text: string, danger = true) => sim.world.human.scope.events.emit('pkNotice', { text, danger }),
    /** Convida o herói para o grupo (ele aceita na hora). */
    invite: (id: string) => sim.partyInvite(id),
    /** Relógio do jogo em ms (anda mais devagar que o real quando os quadros demoram). */
    now: () => sim.world.now,
    /** Magias disparados desde o último `clearCastLog` (t instants do relógio do mundo). */
    castLog: () => castLog.slice(),
    /** Itens usados desde o último `clearCastLog`. */
    itemLog: () => itemLog.slice(),
    clearCastLog: () => {
      castLog.length = 0;
      itemLog.length = 0;
      damageLog.length = 0;
      attackLog.length = 0;
    },
    /** Danos aplicados (por alvo) desde o último `clearCastLog`. */
    damageLog: () => damageLog.slice(),
    /** Ataques (por par fonte/alvo) desde o último `clearCastLog`. */
    attackLog: () => attackLog.slice(),
    /** Textos do mundo (nomes, falas): tamanho, peso e escala — usado para conferir a legibilidade. */
    worldTexts: () => {
      const game = getGame?.();
      const scene = game?.scene.getScene('world');
      if (!scene) return [];
      const out: { text: string; fontSize: string; fontStyle: string; scale: number; x: number; y: number; cx: number; cy: number }[] = [];
      const visit = (list: Phaser.GameObjects.GameObject[]) => {
        for (const o of list) {
          if ((o as Phaser.GameObjects.Text).type === 'Text') {
            const t = o as Phaser.GameObjects.Text;
            out.push({ text: t.text, fontSize: String(t.style.fontSize), fontStyle: String(t.style.fontStyle), scale: t.scaleX, x: t.x, y: t.y, cx: t.parentContainer ? t.parentContainer.x : t.x, cy: t.parentContainer ? t.parentContainer.y : t.y });
          }
          const container = o as Phaser.GameObjects.Container;
          if (Array.isArray(container.list)) visit(container.list);
        }
      };
      visit(scene.children.list);
      return out;
    },
    /** Zoom da câmera e se a posição do desenho está na grade de pixels (sem tremulação). */
    renderInfo: () => {
      const game = getGame?.();
      const scene = game?.scene.getScene('world');
      if (!scene) return null;
      const cam = scene.cameras.main;
      return { zoom: cam.zoom, roundPixels: cam.renderRoundPixels, dpr: window.devicePixelRatio };
    },
  };
  return () => {
    delete window.__RPGZIM__;
  };
}
