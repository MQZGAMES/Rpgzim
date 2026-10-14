// Validação estrutural do mundo: conectividade, áreas protegidas, portas, NPCs e áreas de caça.
import { describe, expect, it } from 'vitest';
import { buildWorld } from '../../src/data/maps/world';
import { buildingAt, cellIndex, isPz, isSolid, regionAt } from '../../src/game/world/GameMap';
import { findPath, lineOfSight } from '../../src/game/movement/pathfinding';

const map = buildWorld();

function reachable(): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
  const q = [map.playerStart];
  seen[cellIndex(map, map.playerStart.x, map.playerStart.y)] = 1;
  while (q.length) {
    const { x, y } = q.shift()!;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (isSolid(map, nx, ny)) continue;
        if (dx && dy && (isSolid(map, x + dx, y) || isSolid(map, x, y + dy))) continue;
        const i = cellIndex(map, nx, ny);
        if (seen[i]) continue;
        seen[i] = 1;
        q.push({ x: nx, y: ny });
      }
  }
  return seen;
}
const seen = reachable();
const canReachNear = (x: number, y: number, r = 1) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (seen[cellIndex(map, x + dx, y + dy)]) return true;
  return false;
};

describe('mundo inicial', () => {
  it('jogador nasce no templo, em área protegida e livre', () => {
    expect(isSolid(map, map.playerStart.x, map.playerStart.y)).toBe(false);
    expect(isPz(map, map.playerStart.x, map.playerStart.y)).toBe(true);
    expect(regionAt(map, map.playerStart.x, map.playerStart.y)?.id).toBe('temple');
    expect(buildingAt(map, map.playerStart.x, map.playerStart.y)?.id).toBe('temple');
  });
  it('tem templo, cidade e área de caça conectados', () => {
    for (const id of ['temple', 'town', 'wild', 'meadow', 'boarwoods', 'goblincamp']) expect(map.regions.some((r) => r.id === id)).toBe(true);
    for (const s of map.spawns) {
      expect(canReachNear(s.x, s.y, 2), `spawn ${s.id}`).toBe(true);
      expect(isPz(map, s.x, s.y)).toBe(false);
    }
  });
  it('todos os NPCs são alcançáveis para conversa (até 2 tiles)', () => {
    for (const n of map.npcs) expect(canReachNear(n.x, n.y, 2), n.npcId).toBe(true);
  });
  it('todas as construções têm porta transitável e interior alcançável no mesmo mapa', () => {
    expect(map.buildings.length).toBeGreaterThanOrEqual(5);
    for (const b of map.buildings) {
      const door = map.doors.find((d) => d.buildingId === b.id)!;
      expect(isSolid(map, door.x, door.y)).toBe(false);
      expect(isSolid(map, door.x, door.y - 1)).toBe(false);
      expect(seen[cellIndex(map, door.x, door.y)], `porta ${b.id}`).toBe(1);
      // célula interna logo acima da porta
      expect(seen[cellIndex(map, door.x, door.y - 2)], `interior ${b.id}`).toBe(1);
      expect(buildingAt(map, door.x, door.y - 2)?.id).toBe(b.id);
      // paredes da fachada são sólidas e bloqueiam a visão
      expect(isSolid(map, b.x, b.y + b.h - 1)).toBe(true);
    }
  });
  it('monstros não entram na vila: toda a cidade é zona protegida', () => {
    expect(isPz(map, 47, 27)).toBe(true);
    expect(isPz(map, 80, 30)).toBe(false);
  });
  it('três casas exploráveis sem troca de cena', () => {
    expect(map.buildings.filter((b) => b.id.startsWith('house_')).length).toBe(3);
  });
});

describe('pathfinding e linha de visão', () => {
  const opts = { width: map.width, height: map.height, passable: (x: number, y: number) => !isSolid(map, x, y), staticFree: (x: number, y: number) => !isSolid(map, x, y) };
  it('encontra caminho do templo até o acampamento goblin', () => {
    const goblin = map.spawns.find((s) => s.monsterId === 'goblin')!;
    const path = findPath(map.playerStart, { x: goblin.x, y: goblin.y }, { ...opts, stopWithin: 2, maxNodes: 20000 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(40);
    // nenhum passo atravessa paredes ou corta quinas
    let prev = map.playerStart;
    for (const p of path!) {
      expect(isSolid(map, p.x, p.y)).toBe(false);
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
      if (dx && dy) expect(isSolid(map, prev.x + dx, prev.y) || isSolid(map, prev.x, prev.y + dy)).toBe(false);
      prev = p;
    }
  });
  it('paredes bloqueiam a linha de visão', () => {
    const temple = map.buildings.find((b) => b.id === 'temple')!;
    const inside = { x: temple.x + 3, y: temple.y + 4 };
    const outside = { x: temple.x + 3, y: temple.y + temple.h + 2 };
    expect(lineOfSight(inside, outside, (x, y) => map.sight[cellIndex(map, x, y)] === 1)).toBe(false);
    expect(lineOfSight({ x: 47, y: 25 }, { x: 47, y: 23 }, (x, y) => map.sight[cellIndex(map, x, y)] === 1)).toBe(true);
  });
});
