// Modelo do mapa (independente de engine). Camadas de tiles, colisão, visão, zonas protegidas,
// construções com interiores no mesmo mapa, objetos, NPCs, áreas de surgimento e regiões.
import type { TilePos } from '../../domain/value-objects/position';
import type { Facing } from '../../domain/value-objects/direction';

export type WallStyle = 'plaster' | 'stone' | 'marble';
export type InteriorStyle = 'wood' | 'stone' | 'temple';
export type FloorStyle = 'wood' | 'stone' | 'marble';
export type RoofStyle = 'red' | 'blue' | 'green' | 'slate';

export interface BuildingDef {
  id: string;
  name: string;
  /** Retângulo da construção (paredes + interior). O telhado cobre de y-1 até y+h-3. */
  x: number;
  y: number;
  w: number;
  h: number;
  wall: WallStyle;
  interior: InteriorStyle;
  floor: FloorStyle;
  roof: RoofStyle;
  doorX: number;
  windows: number[];
  /** Janelas da parede do fundo (colunas). */
  interiorWindows: number[];
  /** Janelas das paredes laterais (lado e linha). */
  sideWindows: { side: 'l' | 'r'; y: number }[];
  chimneyX?: number;
}

export interface DoorDef {
  id: string;
  buildingId: string;
  /** Tile inferior da porta (a porta ocupa y-1 e y). */
  x: number;
  y: number;
  style: 'wood' | 'temple';
}

export interface PropInstance {
  uid: string;
  propId: string;
  x: number;
  y: number;
}

export interface NpcPlacement {
  npcId: string;
  x: number;
  y: number;
  facing: Facing;
}

export interface SpawnDef {
  id: string;
  monsterId: string;
  x: number;
  y: number;
  radius: number;
  count: number;
}

export interface RegionDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pz: boolean;
  /** Cidade: ruas livres (sem área protegida), mas personagens passam uns pelos outros. */
  city?: boolean;
  music: 'temple' | 'town' | 'wild';
  /** Prioridade: regiões mais específicas têm valor maior. */
  priority: number;
}

export interface SignDef {
  x: number;
  y: number;
  text: string;
}

export interface MapLayers {
  ground: Int32Array;
  dirt: Int32Array;
  cobble: Int32Array;
  water: Int32Array;
  decor: Int32Array;
  floor: Int32Array;
  walls: Int32Array;
}

export interface GameMap {
  width: number;
  height: number;
  tileSize: number;
  layers: MapLayers;
  /** Configuração de autotile da água por célula (para animar trocando o quadro). */
  waterConfig: Uint8Array;
  /** 1 = bloqueia movimento. */
  solid: Uint8Array;
  /** 1 = bloqueia linha de visão (paredes, árvores, rochas grandes). */
  sight: Uint8Array;
  /** 1 = zona protegida (sem combate; monstros não entram). */
  pz: Uint8Array;
  /** 1 = tile de cidade (personagens não se bloqueiam). */
  city: Uint8Array;
  /** Índice da construção na célula (-1 = fora). */
  buildingAt: Int16Array;
  props: PropInstance[];
  buildings: BuildingDef[];
  doors: DoorDef[];
  npcs: NpcPlacement[];
  spawns: SpawnDef[];
  regions: RegionDef[];
  signs: SignDef[];
  playerStart: TilePos;
}

export const inBounds = (m: GameMap, x: number, y: number): boolean => x >= 0 && y >= 0 && x < m.width && y < m.height;
export const cellIndex = (m: GameMap, x: number, y: number): number => y * m.width + x;

export function isSolid(m: GameMap, x: number, y: number): boolean {
  return !inBounds(m, x, y) || m.solid[cellIndex(m, x, y)] === 1;
}

export function isPz(m: GameMap, x: number, y: number): boolean {
  return inBounds(m, x, y) && m.pz[cellIndex(m, x, y)] === 1;
}

/** Tile de cidade ou área protegida: personagens passam uns pelos outros (ninguém trava porta/rua). */
export function isCrowdSafe(m: GameMap, x: number, y: number): boolean {
  if (!inBounds(m, x, y)) return false;
  const i = cellIndex(m, x, y);
  return m.pz[i] === 1 || m.city[i] === 1;
}

export function blocksSight(m: GameMap, x: number, y: number): boolean {
  return !inBounds(m, x, y) || m.sight[cellIndex(m, x, y)] === 1;
}

export function regionAt(m: GameMap, x: number, y: number): RegionDef | null {
  let best: RegionDef | null = null;
  for (const r of m.regions)
    if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && (!best || r.priority > best.priority)) best = r;
  return best;
}

export function buildingAt(m: GameMap, x: number, y: number): BuildingDef | null {
  if (!inBounds(m, x, y)) return null;
  const i = m.buildingAt[cellIndex(m, x, y)]!;
  return i >= 0 ? m.buildings[i]! : null;
}
