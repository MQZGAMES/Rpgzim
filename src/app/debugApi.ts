// API de inspeção para testes automatizados (Playwright) e depuração. Exposta somente em desenvolvimento
// ou com ?debug na URL. Não faz parte da jogabilidade.
import type { GameSession } from '../integration/game-ui-bridge/GameSession';

export function installDebugApi(session: GameSession): () => void {
  const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
  if (!enabled) return () => undefined;
  const sim = session.sim;
  window.__RPGZIM__ = {
    ready: () => session.local.get().ready,
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
    buildings: () => sim.world.map.buildings.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, doorX: b.doorX })),
  };
  return () => {
    delete window.__RPGZIM__;
  };
}
