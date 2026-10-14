// Construtor declarativo de mapas: terreno com autotile por cantos, construções com interior no mesmo mapa,
// objetos com pegada de colisão, decoração procedural determinística, NPCs, áreas de surgimento e regiões.
import type { PropDef } from '../../data/props';
import type { Facing } from '../../domain/value-objects/direction';
import { createRng, type Rng } from '../../domain/value-objects/rng';
import type { BuildingDef, DoorDef, GameMap, NpcPlacement, PropInstance, RegionDef, SignDef, SpawnDef } from './GameMap';

export const Terrain = { Grass: 0, Dirt: 1, Cobble: 2, Water: 3 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class MapBuilder {
  readonly w: number;
  readonly h: number;
  readonly terrain: Uint8Array;
  readonly darkGrass: Uint8Array;
  readonly floor: Int32Array;
  readonly walls: Int32Array;
  readonly decor: Int32Array;
  readonly solid: Uint8Array;
  readonly sight: Uint8Array;
  readonly pz: Uint8Array;
  /** Células reservadas: a decoração procedural não coloca objetos aqui. */
  readonly reserved: Uint8Array;
  readonly bridge: Uint8Array;
  readonly buildingAt: Int16Array;
  /** Marca os tiles-base de objetos (para espaçamento da decoração procedural). */
  readonly propBase: Uint8Array;
  readonly props: PropInstance[] = [];
  readonly buildings: BuildingDef[] = [];
  readonly doors: DoorDef[] = [];
  readonly npcs: NpcPlacement[] = [];
  readonly spawns: SpawnDef[] = [];
  readonly regions: RegionDef[] = [];
  readonly signs: SignDef[] = [];
  playerStart = { x: 1, y: 1 };
  readonly rng: Rng;
  private propSeq = 0;

  constructor(
    w: number,
    h: number,
    private readonly tileNames: Readonly<Record<string, number>>,
    private readonly propDefs: Readonly<Record<string, PropDef>>,
    seed = 1337,
  ) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.terrain = new Uint8Array(n);
    this.darkGrass = new Uint8Array(n);
    this.floor = new Int32Array(n).fill(-1);
    this.walls = new Int32Array(n).fill(-1);
    this.decor = new Int32Array(n).fill(-1);
    this.solid = new Uint8Array(n);
    this.sight = new Uint8Array(n);
    this.pz = new Uint8Array(n);
    this.reserved = new Uint8Array(n);
    this.bridge = new Uint8Array(n);
    this.buildingAt = new Int16Array(n).fill(-1);
    this.propBase = new Uint8Array(n);
    this.rng = createRng(seed);
  }

  // ------------------------------------------------------------------ utilidades
  tile(name: string): number {
    const i = this.tileNames[name];
    if (i === undefined) throw new Error(`Tile inexistente no tileset: ${name}`);
    return i;
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  private hash(x: number, y: number, salt = 0): number {
    let h = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  forRect(r: Rect, fn: (x: number, y: number) => void): void {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (this.inside(x, y)) fn(x, y);
  }
  reserve(r: Rect): this {
    this.forRect(r, (x, y) => (this.reserved[this.idx(x, y)] = 1));
    return this;
  }
  setSolid(x: number, y: number, v = 1): void {
    if (this.inside(x, y)) this.solid[this.idx(x, y)] = v;
  }

  // ------------------------------------------------------------------ terreno
  setTerrain(x: number, y: number, t: Terrain): void {
    if (this.inside(x, y)) this.terrain[this.idx(x, y)] = t;
  }
  rect(r: Rect, t: Terrain): this {
    this.forRect(r, (x, y) => this.setTerrain(x, y, t));
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, t: Terrain, jitter = 0): this {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d <= 1 + (this.hash(x, y, 7) - 0.5) * jitter) this.setTerrain(x, y, t);
      }
    return this;
  }
  /** Grama escura (mata fechada) com borda irregular que se mistura à grama clara. */
  dark(r: Rect, feather = 3): this {
    this.forRect({ x: r.x - feather, y: r.y - feather, w: r.w + feather * 2, h: r.h + feather * 2 }, (x, y) => {
      const dx = Math.max(r.x - x, x - (r.x + r.w - 1), 0);
      const dy = Math.max(r.y - y, y - (r.y + r.h - 1), 0);
      const d = Math.max(dx, dy);
      if (d === 0 || this.hash(x, y, 61) < 1 - d / (feather + 1)) this.darkGrass[this.idx(x, y)] = 1;
    });
    return this;
  }
  /** Caminho por pontos (polilinha) com largura em tiles. */
  path(points: readonly [number, number][], width: number, t: Terrain = Terrain.Dirt, reserveMargin = 1): this {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i]!;
      const [x1, y1] = points[i + 1]!;
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s <= steps; s++) {
        const cx = x0 + ((x1 - x0) * s) / steps;
        const cy = y0 + ((y1 - y0) * s) / steps;
        const half = (width - 1) / 2;
        for (let dy = -Math.ceil(half); dy <= Math.ceil(half); dy++)
          for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
            if (Math.abs(dx) > half + 0.01 || Math.abs(dy) > half + 0.01) continue;
            const x = Math.round(cx + dx);
            const y = Math.round(cy + dy);
            this.setTerrain(x, y, t);
          }
        const m = Math.ceil(half) + reserveMargin;
        this.reserve({ x: Math.round(cx) - m, y: Math.round(cy) - m, w: m * 2 + 1, h: m * 2 + 1 });
      }
    }
    return this;
  }
  /** Ponte de madeira horizontal sobre água (linhas y..y+2). */
  bridgeH(x0: number, x1: number, y: number): this {
    for (let x = x0; x <= x1; x++) {
      this.floor[this.idx(x, y)] = this.tile('bridge_top');
      this.floor[this.idx(x, y + 1)] = this.tile('bridge_mid');
      this.floor[this.idx(x, y + 2)] = this.tile('bridge_bot');
      for (let k = 0; k < 3; k++) this.bridge[this.idx(x, y + k)] = 1;
    }
    this.reserve({ x: x0 - 1, y: y - 1, w: x1 - x0 + 3, h: 5 });
    return this;
  }
  floorTile(x: number, y: number, name: string): this {
    if (this.inside(x, y)) this.floor[this.idx(x, y)] = this.tile(name);
    return this;
  }
  decorTile(x: number, y: number, name: string): this {
    if (this.inside(x, y)) this.decor[this.idx(x, y)] = this.tile(name);
    return this;
  }
  carpet(r: Rect): this {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const v = y === r.y ? 't' : y === r.y + r.h - 1 ? 'b' : '';
        const hz = x === r.x ? 'l' : x === r.x + r.w - 1 ? 'r' : '';
        this.floorTile(x, y, `carpet_${v + hz || 'c'}`);
      }
    return this;
  }

  // ------------------------------------------------------------------ construções (interior no mesmo mapa)
  building(def: Omit<BuildingDef, 'windows' | 'interiorWindows' | 'sideWindows'> & { windows?: number[]; interiorWindows?: number[]; sideWindows?: BuildingDef['sideWindows'] }): this {
    const b: BuildingDef = { windows: [], interiorWindows: [], sideWindows: [], ...def };
    const index = this.buildings.length;
    this.buildings.push(b);
    const { x, y, w, h } = b;
    const frontTop = y + h - 2;
    const frontBot = y + h - 1;
    for (let yy = y; yy <= frontBot; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const i = this.idx(xx, yy);
        this.buildingAt[i] = index;
        this.reserved[i] = 1;
      }
    // paredes internas do fundo (2 linhas)
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      const win = b.interiorWindows.includes(xx) ? '_window' : '';
      this.walls[this.idx(xx, y)] = this.tile(`iwall_${b.interior}_top${win}`);
      this.walls[this.idx(xx, y + 1)] = this.tile(`iwall_${b.interior}_bot${win}`);
      this.setSolid(xx, y);
      this.setSolid(xx, y + 1);
      this.sight[this.idx(xx, y)] = 1;
      this.sight[this.idx(xx, y + 1)] = 1;
    }
    // topo das paredes laterais
    for (let yy = y; yy < frontTop; yy++) {
      const winL = b.sideWindows.some((s) => s.side === 'l' && s.y === yy) ? '_window' : '';
      const winR = b.sideWindows.some((s) => s.side === 'r' && s.y === yy) ? '_window' : '';
      this.walls[this.idx(x, yy)] = this.tile(`wtop_${b.interior}_l${winL}`);
      this.walls[this.idx(x + w - 1, yy)] = this.tile(`wtop_${b.interior}_r${winR}`);
      for (const xx of [x, x + w - 1]) {
        this.setSolid(xx, yy);
        this.sight[this.idx(xx, yy)] = 1;
      }
    }
    // piso
    const floorName = b.floor === 'wood' ? 'floor_wood' : b.floor === 'stone' ? 'floor_stone' : 'floor_marble';
    for (let yy = y + 2; yy < frontTop; yy++)
      for (let xx = x + 1; xx < x + w - 1; xx++) {
        const v = b.floor === 'marble' ? (xx + yy) % 2 : Math.floor(this.hash(xx, yy, 3) * 2);
        this.floor[this.idx(xx, yy)] = this.tile(`${floorName}_${v}`);
      }
    // fachada (2 linhas) com janelas e porta
    for (let xx = x; xx < x + w; xx++) {
      const part = xx === x ? 'l' : xx === x + w - 1 ? 'r' : 'm';
      const isDoor = xx === b.doorX;
      let top = `wall_${b.wall}_top_${part}`;
      if (part === 'm' && b.windows.includes(xx)) top = `wall_${b.wall}_top_window`;
      else if (part === 'm' && b.wall === 'plaster' && (xx - x) % 4 === 2) top = 'wall_plaster_top_brace';
      this.walls[this.idx(xx, frontTop)] = this.tile(isDoor ? `wall_${b.wall}_door_top` : top);
      this.walls[this.idx(xx, frontBot)] = this.tile(isDoor ? `wall_${b.wall}_door_bot` : `wall_${b.wall}_bot_${part}`);
      if (!isDoor) {
        this.setSolid(xx, frontTop);
        this.setSolid(xx, frontBot);
        this.sight[this.idx(xx, frontTop)] = 1;
        this.sight[this.idx(xx, frontBot)] = 1;
      }
    }
    this.doors.push({ id: `door_${b.id}`, buildingId: b.id, x: b.doorX, y: frontBot, style: b.wall === 'marble' ? 'temple' : 'wood' });
    // a linha do telhado acima da construção e a frente da porta ficam livres de decoração
    this.reserve({ x: x - 1, y: y - 2, w: w + 2, h: 2 });
    this.reserve({ x: b.doorX - 1, y: frontBot + 1, w: 3, h: 2 });
    for (const s of b.sideWindows) this.reserve({ x: s.side === 'l' ? x - 1 : x + w, y: s.y, w: 1, h: 1 });
    return this;
  }

  // ------------------------------------------------------------------ objetos
  canPlace(propId: string, x: number, y: number, respectReserved: boolean): boolean {
    const def = this.propDefs[propId];
    if (!def) throw new Error(`Objeto desconhecido: ${propId}`);
    const cells = def.blocks.length ? def.blocks : [[0, 0] as const];
    for (const [dx, dy] of cells) {
      const cx = x + dx;
      const cy = y + dy;
      if (!this.inside(cx, cy)) return false;
      const i = this.idx(cx, cy);
      if (this.solid[i] || this.terrain[i] === Terrain.Water || this.walls[i]! >= 0) return false;
      if (respectReserved && (this.reserved[i] || this.terrain[i] !== Terrain.Grass)) return false;
    }
    return true;
  }

  prop(propId: string, x: number, y: number, opts: { force?: boolean } = {}): this {
    const def = this.propDefs[propId];
    if (!def) throw new Error(`Objeto desconhecido: ${propId}`);
    if (!opts.force && !this.canPlace(propId, x, y, false)) throw new Error(`Não é possível colocar ${propId} em ${x},${y}`);
    this.props.push({ uid: `p${this.propSeq++}`, propId, x, y });
    this.propBase[this.idx(x, y)] = 1;
    for (const [dx, dy] of def.blocks) {
      const i = this.idx(x + dx, y + dy);
      this.solid[i] = 1;
      this.reserved[i] = 1;
      if (def.blocksSight) this.sight[i] = 1;
    }
    return this;
  }

  /** Espalha objetos de forma determinística numa área, respeitando reservas e espaçamento. */
  scatter(area: Rect, options: { props: readonly string[]; density: number; salt: number; spacing?: number; predicate?: (x: number, y: number) => boolean }): this {
    const spacing = options.spacing ?? 1;
    this.forRect(area, (x, y) => {
      if (this.hash(x, y, options.salt) > options.density) return;
      if (options.predicate && !options.predicate(x, y)) return;
      const propId = options.props[Math.floor(this.hash(x, y, options.salt + 1) * options.props.length)]!;
      if (!this.canPlace(propId, x, y, true)) return;
      for (let dy = -spacing; dy <= spacing; dy++)
        for (let dx = -spacing; dx <= spacing; dx++) if (this.inside(x + dx, y + dy) && this.propBase[this.idx(x + dx, y + dy)]) return;
      this.prop(propId, x, y);
    });
    return this;
  }

  /** Decoração plana sobre a grama (flores, pedrinhas, capim). */
  scatterDecor(area: Rect, names: readonly string[], density: number, salt: number): this {
    this.forRect(area, (x, y) => {
      const i = this.idx(x, y);
      if (this.terrain[i] !== Terrain.Grass || this.solid[i] || this.walls[i]! >= 0 || this.floor[i]! >= 0 || this.decor[i]! >= 0) return;
      if (this.hash(x, y, salt) > density) return;
      this.decor[i] = this.tile(names[Math.floor(this.hash(x, y, salt + 1) * names.length)]!);
    });
    return this;
  }

  /** Faixa de floresta densa e intransponível nas bordas do mapa. */
  forestBorder(thickness: number, trees: readonly string[]): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const d = Math.min(x, y, this.w - 1 - x, this.h - 1 - y);
        if (d >= thickness) continue;
        const i = this.idx(x, y);
        this.darkGrass[i] = 1;
        if (this.solid[i]) continue;
        if ((x + y) % 2 === 0 || d === thickness - 1) {
          const t = trees[Math.floor(this.hash(x, y, 91) * trees.length)]!;
          this.props.push({ uid: `p${this.propSeq++}`, propId: t, x, y });
        }
        this.solid[i] = 1;
        this.sight[i] = 1;
        this.reserved[i] = 1;
      }
    return this;
  }

  // ------------------------------------------------------------------ entidades e regiões
  npc(npcId: string, x: number, y: number, facing: Facing = 'down'): this {
    this.npcs.push({ npcId, x, y, facing });
    this.reserve({ x: x - 1, y: y - 1, w: 3, h: 3 });
    return this;
  }
  spawn(id: string, monsterId: string, x: number, y: number, radius: number, count: number): this {
    this.spawns.push({ id, monsterId, x, y, radius, count });
    this.reserve({ x: x - 1, y: y - 1, w: 3, h: 3 });
    return this;
  }
  region(def: RegionDef): this {
    this.regions.push(def);
    if (def.pz) this.forRect(def, (x, y) => (this.pz[this.idx(x, y)] = 1));
    return this;
  }
  sign(x: number, y: number, text: string): this {
    this.signs.push({ x, y, text });
    return this.prop('sign', x, y);
  }

  // ------------------------------------------------------------------ autotile e montagem final
  private vertexIs(vx: number, vy: number, t: Terrain, all: boolean): boolean {
    const cells = [
      [vx - 1, vy - 1],
      [vx, vy - 1],
      [vx - 1, vy],
      [vx, vy],
    ];
    let any = false;
    let every = true;
    for (const [cx, cy] of cells) {
      const x = Math.max(0, Math.min(this.w - 1, cx!));
      const y = Math.max(0, Math.min(this.h - 1, cy!));
      const is = this.terrain[this.idx(x, y)] === t;
      any ||= is;
      every &&= is;
    }
    return all ? every : any;
  }
  private config(x: number, y: number, t: Terrain, all: boolean): number {
    return (
      (this.vertexIs(x, y, t, all) ? 1 : 0) |
      (this.vertexIs(x + 1, y, t, all) ? 2 : 0) |
      (this.vertexIs(x, y + 1, t, all) ? 4 : 0) |
      (this.vertexIs(x + 1, y + 1, t, all) ? 8 : 0)
    );
  }

  build(tileSize = 16): GameMap {
    const n = this.w * this.h;
    const ground = new Int32Array(n);
    const dirt = new Int32Array(n).fill(-1);
    const cobble = new Int32Array(n).fill(-1);
    const water = new Int32Array(n).fill(-1);
    const waterConfig = new Uint8Array(n);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        const h = this.hash(x, y, 1);
        if (this.darkGrass[i]) ground[i] = this.tile(`grass_dark_${Math.floor(h * 4)}`);
        else if (h < 0.06) ground[i] = this.tile(`grass_flowers_${Math.floor(this.hash(x, y, 2) * 3)}`);
        else ground[i] = this.tile(`grass_${Math.floor(this.hash(x, y, 3) * 6)}`);
        const v = this.hash(x, y, 4);
        const dc = this.config(x, y, Terrain.Dirt, false);
        if (dc) dirt[i] = this.tile(dc === 15 && v > 0.55 ? (v > 0.8 ? 'dirt_15_c' : 'dirt_15_b') : `dirt_${dc}`);
        const cc = this.config(x, y, Terrain.Cobble, false);
        if (cc) cobble[i] = this.tile(cc === 15 && v > 0.4 ? (v > 0.8 ? 'cobble_15_d' : v > 0.6 ? 'cobble_15_c' : 'cobble_15_b') : `cobble_${cc}`);
        const wc = this.config(x, y, Terrain.Water, true);
        waterConfig[i] = wc;
        if (wc) water[i] = this.tile(`water_0_${wc}`);
        if (this.terrain[i] === Terrain.Water && !this.bridge[i]) this.solid[i] = 1;
      }
    // bordas do mapa sempre bloqueadas
    for (let x = 0; x < this.w; x++) {
      this.solid[this.idx(x, 0)] = 1;
      this.solid[this.idx(x, this.h - 1)] = 1;
    }
    for (let y = 0; y < this.h; y++) {
      this.solid[this.idx(0, y)] = 1;
      this.solid[this.idx(this.w - 1, y)] = 1;
    }
    return {
      width: this.w,
      height: this.h,
      tileSize,
      layers: { ground, dirt, cobble, water, decor: this.decor, floor: this.floor, walls: this.walls },
      waterConfig,
      solid: this.solid,
      sight: this.sight,
      pz: this.pz,
      buildingAt: this.buildingAt,
      props: this.props,
      buildings: this.buildings,
      doors: this.doors,
      npcs: this.npcs,
      spawns: this.spawns,
      regions: this.regions,
      signs: this.signs,
      playerStart: this.playerStart,
    };
  }
}
