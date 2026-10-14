// Tileset 16x16: terreno com autotile por cantos (marching squares), água animada,
// pisos internos, paredes externas/internas, telhados e decoração plana.
import { PixelCanvas, mix, withAlpha, type Color } from './lib/canvas.ts';
import { P } from './lib/palette.ts';
import { hash2, mulberry32, periodicNoise, bayer } from './lib/rng.ts';

export const T = 16;

export interface TileEntry {
  name: string;
  canvas: PixelCanvas;
}

const tiles: TileEntry[] = [];
const add = (name: string, canvas: PixelCanvas) => tiles.push({ name, canvas });
const tile = () => new PixelCanvas(T, T);

// ---------------------------------------------------------------- grama
function grassBase(seed: number, opts: { flowers?: number; dark?: boolean; tufts?: number } = {}): PixelCanvas {
  const c = tile();
  const g = P.grass;
  const base = opts.dark ? g[2]! : g[3]!;
  const light = opts.dark ? g[3]! : g[4]!;
  const dark = opts.dark ? g[1]! : g[2]!;
  c.fill(base);
  // manchas suaves e contínuas entre tiles (ruído periódico)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = periodicNoise(x, y, T, 8, 11) * 0.6 + periodicNoise(x, y, T, 4, 12) * 0.4;
      if (n > 0.66 && bayer(x, y) < (n - 0.66) * 4) c.set(x, y, light);
      if (n < 0.3 && bayer(x, y) < (0.3 - n) * 3) c.set(x, y, dark);
    }
  const rnd = mulberry32(seed);
  const tufts = opts.tufts ?? 4;
  for (let i = 0; i < tufts; i++) {
    const x = Math.floor(rnd() * T);
    const y = Math.floor(rnd() * T);
    // tufo em "v": duas lâminas escuras e uma ponta clara
    const w = (dx: number, dy: number, col: Color) => c.set((x + dx + T) % T, (y + dy + T) % T, col);
    w(0, 0, dark);
    w(2, 0, dark);
    w(1, 1, dark);
    w(0, -1, light);
    w(2, -1, light);
    if (rnd() < 0.5) w(1, -1, g[5]!);
  }
  const flowerColors = [P.white, P.gold[4]!, P.pink[3]!, P.blue[4]!, P.red[4]!];
  for (let i = 0; i < (opts.flowers ?? 0); i++) {
    const x = 1 + Math.floor(rnd() * (T - 3));
    const y = 1 + Math.floor(rnd() * (T - 3));
    const col = flowerColors[Math.floor(rnd() * flowerColors.length)]!;
    c.set(x, y - 1, col);
    c.set(x - 1, y, col);
    c.set(x + 1, y, col);
    c.set(x, y + 1, col);
    c.set(x, y, P.gold[3]!);
    c.set(x + 1, y + 1, dark);
  }
  return c;
}

for (let i = 0; i < 6; i++) add(`grass_${i}`, grassBase(100 + i, { tufts: 3 + (i % 3) }));
for (let i = 0; i < 3; i++) add(`grass_flowers_${i}`, grassBase(200 + i, { flowers: 2 + i, tufts: 2 }));
for (let i = 0; i < 4; i++) add(`grass_dark_${i}`, grassBase(300 + i, { dark: true, tufts: 4 + i }));

// ---------------------------------------------------------------- autotile por cantos
type MaskFn = (x: number, y: number) => boolean;

function cornerMask(config: number, seed: number, amp = 0.16): MaskFn {
  const tl = config & 1 ? 1 : 0;
  const tr = config & 2 ? 1 : 0;
  const bl = config & 4 ? 1 : 0;
  const br = config & 8 ? 1 : 0;
  return (x, y) => {
    const cx = Math.max(0, Math.min(T - 1, x));
    const cy = Math.max(0, Math.min(T - 1, y));
    const u = (cx + 0.5) / T;
    const v = (cy + 0.5) / T;
    const val = tl * (1 - u) * (1 - v) + tr * u * (1 - v) + bl * (1 - u) * v + br * u * v;
    const n = (periodicNoise(cx, cy, T, 4, seed) - 0.5) * 2 * amp;
    return val + n > 0.5;
  };
}

interface TerrainStyle {
  interior: (x: number, y: number, variant: number, frame: number) => Color;
  innerRim: (x: number, y: number) => Color;
  innerRim2?: (x: number, y: number) => Color;
  outerRim?: (x: number, y: number) => Color;
}

function terrainTile(config: number, style: TerrainStyle, seed: number, variant = 0, frame = 0): PixelCanvas {
  const c = tile();
  const m = cornerMask(config, seed);
  const edge = (x: number, y: number) => !m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1);
  const edge2 = (x: number, y: number) => edge(x - 1, y) || edge(x + 1, y) || edge(x, y - 1) || edge(x, y + 1);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (m(x, y)) {
        if (edge(x, y)) c.set(x, y, style.innerRim(x, y));
        else if (style.innerRim2 && edge2(x, y)) c.set(x, y, style.innerRim2(x, y));
        else c.set(x, y, style.interior(x, y, variant, frame));
      } else if (style.outerRim) {
        const near = m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1);
        if (near) {
          const col = style.outerRim(x, y);
          if (col) c.set(x, y, col);
        }
      }
    }
  return c;
}

// terra batida (caminhos): textura fina e de baixo contraste para não evidenciar a repetição
const dirtStyle: TerrainStyle = {
  interior: (x, y, variant) => {
    const d = P.dirt;
    const h = hash2(x, y, 41 + variant);
    const pebble = hash2(Math.floor(x / 2), Math.floor(y / 2), 44 + variant);
    if (pebble > 0.965 && x % 2 === 0) return y % 2 === 0 ? d[5]! : d[2]!;
    if (pebble > 0.965) return y % 2 === 0 ? d[4]! : d[1]!;
    if (h < 0.05) return d[2]!;
    if (h > 0.9) return d[4]!;
    return d[3]!;
  },
  innerRim: () => P.dirt[2]!,
  outerRim: (x, y) => (hash2(x, y, 43) < 0.55 ? P.grass[2]! : 0),
};

// calçamento de pedra (Voronoi periódico)
function voronoiStones(seed: number, cells = 3) {
  const rnd = mulberry32(seed);
  const pts: { x: number; y: number; tint: number }[] = [];
  const cs = T / cells;
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++)
      pts.push({ x: (i + 0.2 + rnd() * 0.6) * cs, y: (j + 0.2 + rnd() * 0.6) * cs, tint: rnd() });
  return (x: number, y: number) => {
    let d1 = 1e9;
    let d2 = 1e9;
    let best = pts[0]!;
    let bdx = 0;
    let bdy = 0;
    for (const p of pts)
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const dx = x + 0.5 - (p.x + ox * T);
          const dy = y + 0.5 - (p.y + oy * T);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = p;
            bdx = dx;
            bdy = dy;
          } else if (d < d2) d2 = d;
        }
    return { border: d2 - d1 < 1.15, dx: bdx, dy: bdy, tint: best.tint };
  };
}

function cobbleStyle(seed: number): TerrainStyle {
  const vor = voronoiStones(seed);
  const s = P.stone;
  const warmBase = mix(s[3]!, P.sand[2]!, 0.35);
  return {
    interior: (x, y) => {
      const v = vor(x, y);
      if (v.border) return s[2]!;
      const warm = v.tint > 0.55;
      const base = warm ? warmBase : v.tint < 0.2 ? mix(s[3]!, s[2]!, 0.5) : s[3]!;
      const hi = warm ? mix(s[4]!, P.sand[3]!, 0.35) : s[4]!;
      const lo = warm ? mix(s[2]!, P.dirt[3]!, 0.3) : mix(s[2]!, s[3]!, 0.3);
      if (v.dx + v.dy < -2.2) return hi;
      if (v.dx + v.dy > 2.4) return lo;
      return base;
    },
    innerRim: () => s[1]!,
    outerRim: (x, y) => (hash2(x, y, 77) < 0.7 ? P.grass[2]! : 0),
  };
}

// água animada: tons amplos suaves, cristas de onda que deslizam e brilhos pontuais
const WAVES = (() => {
  const rnd = mulberry32(93);
  return Array.from({ length: 4 }, () => ({ x: Math.floor(rnd() * T), y: Math.floor(rnd() * T), len: 3 + Math.floor(rnd() * 2) }));
})();
function waterInterior(x: number, y: number, frame: number): Color {
  const w = P.water;
  const n = periodicNoise(x, y, T, 8, 90);
  for (const wave of WAVES) {
    const wx = (wave.x + frame * 2) % T;
    const dx = (x - wx + T) % T;
    if (y === wave.y && dx < wave.len) return dx === 1 ? w[5]! : w[4]!;
    if (y === (wave.y + 1) % T && dx > 0 && dx < wave.len - 1) return w[3]!;
  }
  if (hash2(x, y, 95 + frame) > 0.992) return w[5]!;
  const h = hash2(x, y, 96);
  if (h < 0.05 && n < 0.5) return w[1]!;
  if (h > 0.93) return w[3]!;
  return w[2]!;
}

const waterStyle = (frame: number): TerrainStyle => ({
  interior: (x, y) => waterInterior(x, y, frame),
  innerRim: (x, y) => ((x + y + frame) % 5 === 0 ? P.water[6]! : P.water[5]!),
  innerRim2: () => P.water[3]!,
  outerRim: () => P.grass[1]!,
});

for (let cfg = 1; cfg < 16; cfg++) add(`dirt_${cfg}`, terrainTile(cfg, dirtStyle, 7, 0));
add('dirt_15_b', terrainTile(15, dirtStyle, 7, 1));
add('dirt_15_c', terrainTile(15, dirtStyle, 7, 2));
for (let cfg = 1; cfg < 16; cfg++) add(`cobble_${cfg}`, terrainTile(cfg, cobbleStyle(501), 9, 0));
add('cobble_15_b', terrainTile(15, cobbleStyle(502), 9, 0));
add('cobble_15_c', terrainTile(15, cobbleStyle(503), 9, 0));
add('cobble_15_d', terrainTile(15, cobbleStyle(504), 9, 0));
for (let f = 0; f < 3; f++) for (let cfg = 1; cfg < 16; cfg++) add(`water_${f}_${cfg}`, terrainTile(cfg, waterStyle(f), 13, 0, f));

// ---------------------------------------------------------------- pisos internos
function woodFloor(seed: number): PixelCanvas {
  const c = tile();
  const w = P.wood;
  const rnd = mulberry32(seed);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    const offset = Math.floor(rnd() * 12) + (row % 2) * 6;
    for (let y = y0; y < y0 + 4; y++)
      for (let x = 0; x < T; x++) {
        let col = w[4]!;
        if (y === y0) col = w[5]!;
        if (y === y0 + 3) col = w[2]!;
        if (y > y0 && y < y0 + 3 && hash2(x, y, seed) < 0.12) col = w[3]!;
        if ((x + offset) % 16 === 0 && y !== y0 + 3) col = w[2]!;
        c.set(x, y, col);
      }
  }
  return c;
}
add('floor_wood_0', woodFloor(1));
add('floor_wood_1', woodFloor(2));

function marbleFloor(alt: boolean): PixelCanvas {
  const c = tile();
  const m = P.marble;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const qx = x < 8 ? 0 : 1;
      const qy = y < 8 ? 0 : 1;
      const light = (qx + qy + (alt ? 1 : 0)) % 2 === 0;
      let col = light ? m[4]! : m[3]!;
      const vein = periodicNoise(x, y, T, 4, light ? 61 : 62);
      if (vein > 0.48 && vein < 0.52) col = light ? m[3]! : m[2]!;
      if (x % 8 === 0 || y % 8 === 0) col = m[2]!;
      if ((x % 8 === 1 && y % 8 !== 0) || (y % 8 === 1 && x % 8 !== 0)) col = light ? m[5]! : m[4]!;
      c.set(x, y, col);
    }
  return c;
}
add('floor_marble_0', marbleFloor(false));
add('floor_marble_1', marbleFloor(true));

function stoneFloor(seed: number): PixelCanvas {
  const c = tile();
  const s = P.stone;
  const rnd = mulberry32(seed);
  // lajes 8x8 com rejunte e luz suave
  for (let by = 0; by < 2; by++)
    for (let bx = 0; bx < 2; bx++) {
      const tone = rnd() < 0.5 ? s[3]! : mix(s[3]!, P.sand[1]!, 0.25);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          let col = tone;
          if (x === 0 || y === 0) col = s[1]!;
          else if (x === 1 || y === 1) col = s[4]!;
          else if (x === 7 || y === 7) col = s[2]!;
          else if (hash2(x + bx * 8, y + by * 8, seed) < 0.06) col = s[2]!;
          c.set(bx * 8 + x, by * 8 + y, col);
        }
    }
  return c;
}
add('floor_stone_0', stoneFloor(31));
add('floor_stone_1', stoneFloor(32));

// tapete vermelho com borda dourada (9-slice)
function carpet(part: string): PixelCanvas {
  const c = tile();
  const r = P.red;
  const g = P.gold;
  const left = part.includes('l');
  const right = part.includes('r');
  const top = part.includes('t');
  const bottom = part.includes('b');
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let col = (x + y) % 4 === 0 ? r[3]! : r[2]!;
      if (hash2(x, y, 5) < 0.05) col = r[4]!;
      const dl = left ? x : 99;
      const dr = right ? T - 1 - x : 99;
      const dt = top ? y : 99;
      const db = bottom ? T - 1 - y : 99;
      const d = Math.min(dl, dr, dt, db);
      if (d === 0) col = r[1]!;
      else if (d === 1 || d === 3) col = g[3]!;
      else if (d === 2) col = r[1]!;
      c.set(x, y, col);
    }
  // losango central decorativo
  if (part === 'c') {
    for (let i = 0; i < 4; i++) {
      c.set(7 - i, 4 + i, g[3]!);
      c.set(8 + i, 4 + i, g[3]!);
      c.set(7 - i, 11 - i, g[3]!);
      c.set(8 + i, 11 - i, g[3]!);
    }
  }
  return c;
}
for (const part of ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']) add(`carpet_${part}`, carpet(part));

// ---------------------------------------------------------------- paredes externas (face com 2 tiles de altura)
type WallStyle = 'plaster' | 'stone' | 'marble';
type WallPart = 'l' | 'm' | 'r';

function eaveShadow(c: PixelCanvas) {
  for (let x = 0; x < T; x++) {
    c.set(x, 0, P.outline);
    c.blend(x, 1, withAlpha(P.black, 150));
    c.blend(x, 2, withAlpha(P.black, 90));
    c.blend(x, 3, withAlpha(P.black, 40));
  }
}

function plasterFill(c: PixelCanvas, y0: number, y1: number, seed: number) {
  const p = P.plaster;
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < T; x++) {
      const h = hash2(x, y, seed);
      c.set(x, y, h < 0.08 ? p[2]! : h > 0.95 ? p[4]! : p[3]!);
    }
}

function beam(c: PixelCanvas, x0: number, y0: number, w: number, h: number) {
  const wd = P.wood;
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      let col = wd[2]!;
      if (y === y0 && h > 1) col = wd[3]!;
      if (y === y0 + h - 1 && h > 1) col = wd[1]!;
      if (w <= 3 && x === x0) col = wd[3]!;
      if (w <= 3 && x === x0 + w - 1) col = wd[1]!;
      c.set(x, y, col);
    }
}

function stoneBlocks(c: PixelCanvas, y0: number, y1: number, palette: readonly Color[], seed: number, rowH = 4) {
  for (let y = y0; y <= y1; y++) {
    const row = Math.floor((y - y0) / rowH);
    const ry = (y - y0) % rowH;
    const off = row % 2 === 0 ? 0 : 4;
    for (let x = 0; x < T; x++) {
      const bx = (x + off) % 8;
      const blockId = Math.floor((x + off) / 8) + row * 7;
      const tone = hash2(blockId, row, seed) < 0.3 ? palette[2]! : palette[3]!;
      let col = tone;
      if (ry === rowH - 1 || bx === 7) col = palette[1]!;
      else if (ry === 0) col = palette[4]!;
      else if (bx === 0) col = mix(tone, palette[4]!, 0.5);
      else if (ry === rowH - 2) col = mix(tone, palette[2]!, 0.6);
      c.set(x, y, col);
    }
  }
}

function sideEdges(c: PixelCanvas, part: WallPart, palette: readonly Color[]) {
  if (part === 'l') for (let y = 0; y < T; y++) { c.set(0, y, P.outline); c.set(1, y, palette[2]!); }
  if (part === 'r') for (let y = 0; y < T; y++) { c.set(T - 1, y, P.outline); c.set(T - 2, y, palette[1]!); }
}

function wallTop(style: WallStyle, part: WallPart, variant: 'plain' | 'window' | 'brace' = 'plain'): PixelCanvas {
  const c = tile();
  if (style === 'plaster') {
    plasterFill(c, 0, 15, 3);
    beam(c, 0, 3, T, 2);
    if (part === 'l') beam(c, 0, 0, 3, T);
    if (part === 'r') beam(c, T - 3, 0, 3, T);
    if (variant === 'brace') for (let i = 0; i < 10; i++) { c.set(3 + i, 15 - i, P.wood[2]!); c.set(4 + i, 15 - i, P.wood[1]!); }
  } else if (style === 'stone') {
    stoneBlocks(c, 0, 15, P.stone, 21);
  } else {
    stoneBlocks(c, 0, 15, P.marble, 22, 8);
    for (let x = 0; x < T; x++) { c.set(x, 4, P.gold[2]!); c.set(x, 5, P.gold[4]!); c.set(x, 6, P.gold[1]!); }
  }
  if (variant === 'window') windowOn(c, style);
  eaveShadow(c);
  sideEdges(c, part, style === 'plaster' ? P.wood : style === 'stone' ? P.stone : P.marble);
  return c;
}

function windowOn(c: PixelCanvas, style: WallStyle) {
  const frame = style === 'plaster' ? P.wood : style === 'stone' ? P.wood : P.gold;
  // moldura
  c.rect(3, 4, 10, 10, frame[1]!);
  c.rect(4, 5, 8, 8, frame[3]!);
  // vidro com reflexo diagonal
  for (let y = 6; y < 12; y++)
    for (let x = 5; x < 11; x++) {
      let col = style === 'marble' ? (x + y) % 3 === 0 ? P.arcane[3]! : P.blue[3]! : P.water[3]!;
      if (x + y === 13 || x + y === 14) col = P.water[5]!;
      if (y === 6) col = P.water[2]!;
      c.set(x, y, col);
    }
  c.vline(7, 6, 11, frame[2]!);
  c.vline(8, 6, 11, frame[3]!);
  c.hline(5, 10, 8, frame[2]!);
  // floreira
  if (style !== 'marble') {
    c.rect(2, 13, 12, 2, P.wood[2]!);
    c.hline(2, 13, 15, P.wood[1]!);
    for (let x = 3; x < 13; x++) {
      c.set(x, 12, hash2(x, 12, 9) < 0.5 ? P.green[3]! : P.green[2]!);
      if (x % 3 === 0) c.set(x, 11, x % 2 ? P.pink[3]! : P.red[4]!);
    }
  } else {
    c.hline(3, 12, 14, P.gold[2]!);
  }
}

function wallBottom(style: WallStyle, part: WallPart): PixelCanvas {
  const c = tile();
  if (style === 'plaster') {
    plasterFill(c, 0, 9, 4);
    beam(c, 0, 8, T, 2);
    stoneBlocks(c, 10, 15, P.stone, 23, 3);
    if (part === 'l') beam(c, 0, 0, 3, 8);
    if (part === 'r') beam(c, T - 3, 0, 3, 8);
  } else if (style === 'stone') {
    stoneBlocks(c, 0, 9, P.stone, 24);
    stoneBlocks(c, 10, 15, P.roofSlate, 25, 3);
  } else {
    stoneBlocks(c, 0, 9, P.marble, 26, 8);
    stoneBlocks(c, 10, 15, P.stone, 27, 3);
    c.hline(0, 15, 10, P.gold[3]!);
  }
  for (let x = 0; x < T; x++) c.blend(x, 15, withAlpha(P.black, 110));
  sideEdges(c, part, style === 'plaster' ? P.wood : style === 'stone' ? P.stone : P.marble);
  return c;
}

/** Abertura escura da porta (fica sob o sprite da porta). */
function doorFrame(style: WallStyle, half: 'top' | 'bot'): PixelCanvas {
  const c = half === 'top' ? wallTop(style, 'm') : wallBottom(style, 'm');
  const frame = style === 'marble' ? P.gold : P.wood;
  const y0 = half === 'top' ? 4 : 0;
  for (let y = y0; y < T; y++)
    for (let x = 2; x < 14; x++) {
      let col: Color = mix(P.black, P.wood[0]!, (y - y0) / 24 + (half === 'bot' ? 0.4 : 0));
      if (x === 2 || x === 13) col = frame[2]!;
      if (x === 3 || x === 12) col = frame[1]!;
      if (half === 'top' && y === y0) col = frame[3]!;
      if (half === 'top' && y === y0 + 1 && x > 2 && x < 13) col = frame[1]!;
      c.set(x, y, col);
    }
  if (half === 'bot') c.rect(2, 14, 12, 2, P.stone[2]!).hline(2, 13, 14, P.stone[4]!);
  return c;
}

for (const style of ['plaster', 'stone', 'marble'] as const) {
  for (const part of ['l', 'm', 'r'] as const) {
    add(`wall_${style}_top_${part}`, wallTop(style, part));
    add(`wall_${style}_bot_${part}`, wallBottom(style, part));
  }
  add(`wall_${style}_top_window`, wallTop(style, 'm', 'window'));
  add(`wall_${style}_door_top`, doorFrame(style, 'top'));
  add(`wall_${style}_door_bot`, doorFrame(style, 'bot'));
}
add('wall_plaster_top_brace', wallTop('plaster', 'm', 'brace'));

// ---------------------------------------------------------------- paredes internas (vistas por dentro)
type IWall = 'wood' | 'stone' | 'temple';

function interiorWall(style: IWall, half: 'top' | 'bot', variant: 'plain' | 'window' = 'plain'): PixelCanvas {
  const c = tile();
  if (style === 'wood') {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        let col = x % 4 === 0 ? P.wood[2]! : x % 4 === 1 ? P.wood[4]! : P.wood[3]!;
        if (hash2(x, y, 71) < 0.06) col = P.wood[2]!;
        c.set(x, y, col);
      }
    if (half === 'bot') {
      c.rect(0, 12, T, 4, P.wood[1]!);
      c.hline(0, 15, 12, P.wood[4]!);
      c.hline(0, 15, 13, P.wood[2]!);
    }
  } else if (style === 'stone') {
    stoneBlocks(c, 0, 15, P.stone, half === 'top' ? 81 : 82);
    if (half === 'bot') { c.rect(0, 13, T, 3, P.wood[1]!); c.hline(0, 15, 13, P.wood[3]!); }
  } else {
    stoneBlocks(c, 0, 15, P.marble, half === 'top' ? 83 : 84, 8);
    if (half === 'bot') { c.rect(0, 12, T, 4, P.marble[1]!); c.hline(0, 15, 12, P.gold[3]!); }
  }
  if (half === 'top') {
    // espessura do topo da parede
    c.rect(0, 0, T, 3, style === 'wood' ? P.wood[1]! : P.stone[1]!);
    c.hline(0, 15, 0, P.outline);
    c.hline(0, 15, 2, style === 'temple' ? P.gold[2]! : P.wood[2]!);
  }
  if (variant === 'window') {
    if (half === 'top') {
      c.rect(3, 5, 10, 11, P.wood[1]!);
      for (let y = 6; y < 16; y++)
        for (let x = 4; x < 12; x++) {
          let col = style === 'temple' ? ((x * 3 + y * 5) % 7 < 2 ? P.arcane[2]! : (x + y) % 5 === 0 ? P.gold[3]! : P.blue[3]!) : P.water[4]!;
          if (style !== 'temple' && (x + y) % 6 === 0) col = P.water[5]!;
          c.set(x, y, col);
        }
      c.vline(7, 6, 15, P.wood[2]!);
      c.vline(8, 6, 15, P.wood[3]!);
      if (style === 'temple') { c.set(7, 6, P.gold[4]!); c.set(8, 6, P.gold[4]!); }
    } else {
      c.rect(3, 0, 10, 6, P.wood[1]!);
      for (let y = 0; y < 5; y++)
        for (let x = 4; x < 12; x++) {
          const col = style === 'temple' ? ((x + y * 3) % 7 < 2 ? P.red[3]! : P.blue[3]!) : P.water[4]!;
          c.set(x, y, col);
        }
      c.vline(7, 0, 4, P.wood[2]!);
      c.vline(8, 0, 4, P.wood[3]!);
      c.hline(2, 13, 5, P.wood[3]!);
      c.hline(2, 13, 6, P.wood[1]!);
    }
  }
  return c;
}

for (const style of ['wood', 'stone', 'temple'] as const) {
  add(`iwall_${style}_top`, interiorWall(style, 'top'));
  add(`iwall_${style}_bot`, interiorWall(style, 'bot'));
  add(`iwall_${style}_top_window`, interiorWall(style, 'top', 'window'));
  add(`iwall_${style}_bot_window`, interiorWall(style, 'bot', 'window'));
}

/** Topo das paredes laterais (visto de cima, quando o telhado está oculto). */
function wallTopSide(side: 'l' | 'r', style: IWall): PixelCanvas {
  const c = tile();
  const base = style === 'wood' ? P.wood : style === 'stone' ? P.stone : P.marble;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let col = base[2]!;
      if (hash2(x, y, 55) < 0.1) col = base[1]!;
      c.set(x, y, col);
    }
  const outerX = side === 'l' ? 0 : T - 1;
  const innerX = side === 'l' ? T - 1 : 0;
  for (let y = 0; y < T; y++) {
    c.set(outerX, y, P.outline);
    c.set(innerX, y, P.outline);
    c.set(side === 'l' ? T - 2 : 1, y, base[1]!);
    c.set(side === 'l' ? 1 : T - 2, y, base[3]!);
  }
  return c;
}
function wallTopSideWindow(side: 'l' | 'r', style: IWall): PixelCanvas {
  const c = wallTopSide(side, style);
  const frame = style === 'temple' ? P.gold : P.wood;
  // moldura e vidro ocupando o centro do topo da parede lateral
  c.rect(4, 2, 8, 12, frame[1]!);
  c.rect(5, 3, 6, 10, P.water[4]!);
  for (let i = 0; i < 4; i++) c.set(6 + (i % 2), 4 + i * 2, P.water[5]!);
  c.hline(5, 10, 8, frame[2]!);
  c.vline(side === 'l' ? 11 : 4, 2, 13, frame[3]!);
  return c;
}
for (const style of ['wood', 'stone', 'temple'] as const) {
  add(`wtop_${style}_l`, wallTopSide('l', style));
  add(`wtop_${style}_r`, wallTopSide('r', style));
  add(`wtop_${style}_l_window`, wallTopSideWindow('l', style));
  add(`wtop_${style}_r_window`, wallTopSideWindow('r', style));
}

// ---------------------------------------------------------------- telhados
type RoofStyle = 'red' | 'blue' | 'green' | 'slate';
const roofRamp = (s: RoofStyle) => (s === 'red' ? P.roofRed : s === 'blue' ? P.roofBlue : s === 'green' ? P.roofGreen : P.roofSlate);

function roofTile(style: RoofStyle, row: 'ridge' | 'dark' | 'mid' | 'light' | 'eave', part: WallPart): PixelCanvas {
  const c = tile();
  const r = roofRamp(style);
  const tone = row === 'dark' ? 1 : row === 'light' ? 3 : 2;
  for (let y = 0; y < T; y++) {
    const shRow = Math.floor(y / 4);
    const off = shRow % 2 === 0 ? 0 : 3;
    for (let x = 0; x < T; x++) {
      const ry = y % 4;
      const bx = (x + off) % 6;
      const toneShift = hash2(Math.floor((x + off) / 6), shRow, style.length + tone) < 0.25 ? -1 : 0;
      const t = Math.max(0, Math.min(r.length - 1, tone + toneShift));
      let col = r[t]!;
      if (ry === 3) col = r[Math.max(0, t - 1)]!;
      if (ry === 0) col = r[Math.min(r.length - 1, t + 1)]!;
      if (bx === 5 && ry !== 0) col = r[Math.max(0, t - 1)]!;
      c.set(x, y, col);
    }
  }
  if (row === 'ridge') {
    // cumeeira: faixa clara arredondada + água de trás escurecida
    for (let x = 0; x < T; x++) {
      for (let y = 0; y < 6; y++) c.set(x, y, mix(r[1]!, P.black, 0.25));
      c.set(x, 6, P.outline);
      c.set(x, 7, r[4]!);
      c.set(x, 8, r[3]!);
      c.set(x, 9, r[2]!);
      c.set(x, 10, r[1]!);
      if (x % 4 === 0) { c.set(x, 7, r[3]!); c.set(x, 9, r[1]!); }
      c.set(x, 0, P.outline);
    }
  }
  if (row === 'eave') {
    for (let x = 0; x < T; x++) {
      c.set(x, 12, r[4]!);
      c.set(x, 13, P.wood[2]!);
      c.set(x, 14, P.wood[1]!);
      c.set(x, 15, P.outline);
    }
  }
  if (part === 'l') for (let y = 0; y < T; y++) { c.set(0, y, P.outline); c.set(1, y, P.wood[2]!); c.set(2, y, P.wood[3]!); }
  if (part === 'r') for (let y = 0; y < T; y++) { c.set(T - 1, y, P.outline); c.set(T - 2, y, P.wood[1]!); c.set(T - 3, y, P.wood[2]!); }
  if (row === 'ridge' && part !== 'm') for (let y = 0; y < 6; y++) c.set(part === 'l' ? 0 : T - 1, y, P.outline);
  return c;
}

for (const style of ['red', 'blue', 'green', 'slate'] as const)
  for (const row of ['ridge', 'dark', 'mid', 'light', 'eave'] as const)
    for (const part of ['l', 'm', 'r'] as const) add(`roof_${style}_${row}_${part}`, roofTile(style, row, part));

// ---------------------------------------------------------------- degraus, ponte e decoração plana
function steps(part: WallPart): PixelCanvas {
  const c = tile();
  const s = P.stone;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const ry = y % 5;
      let col = ry === 0 ? s[4]! : ry === 4 ? s[1]! : ry === 3 ? s[2]! : s[3]!;
      if (hash2(x, y, 3) < 0.05) col = s[2]!;
      c.set(x, y, col);
    }
  if (part === 'l') c.vline(0, 0, 15, P.outline).vline(1, 0, 15, s[2]!);
  if (part === 'r') c.vline(15, 0, 15, P.outline).vline(14, 0, 15, s[2]!);
  return c;
}
add('steps_l', steps('l'));
add('steps_m', steps('m'));
add('steps_r', steps('r'));

function bridge(part: 'top' | 'mid' | 'bot'): PixelCanvas {
  const c = tile();
  const w = P.wood;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const px = x % 4;
      let col = px === 0 ? w[5]! : px === 3 ? w[2]! : w[4]!;
      if (hash2(x, y, 17) < 0.06) col = w[3]!;
      if (px === 1 && (y === 3 || y === 12)) col = w[1]!; // pregos
      c.set(x, y, col);
    }
  if (part === 'top') { c.rect(0, 0, T, 3, w[2]!); c.hline(0, 15, 0, P.outline); c.hline(0, 15, 1, w[4]!); for (let x = 1; x < T; x += 5) c.vline(x, 0, 4, w[1]!); }
  if (part === 'bot') { c.rect(0, 13, T, 3, w[2]!); c.hline(0, 15, 15, P.outline); c.hline(0, 15, 13, w[4]!); }
  return c;
}
add('bridge_top', bridge('top'));
add('bridge_mid', bridge('mid'));
add('bridge_bot', bridge('bot'));

function decor(name: string, draw: (c: PixelCanvas, rnd: () => number) => void, seed: number) {
  const c = tile();
  draw(c, mulberry32(seed));
  add(name, c);
}

const flowerCluster = (petal: Color, center: Color) => (c: PixelCanvas, rnd: () => number) => {
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(rnd() * 11);
    const y = 3 + Math.floor(rnd() * 10);
    c.set(x, y + 1, P.grass[2]!);
    c.set(x, y + 2, P.grass[2]!);
    c.set(x + 1, y + 2, P.grass[1]!);
    c.set(x - 1, y, petal);
    c.set(x + 1, y, petal);
    c.set(x, y - 1, petal);
    c.set(x, y, center);
    c.set(x, y + 1 - 0, mix(petal, P.black, 0.35));
  }
};
decor('decor_flowers_white', flowerCluster(P.white, P.gold[3]!), 1);
decor('decor_flowers_yellow', flowerCluster(P.gold[4]!, P.fire[3]!), 2);
decor('decor_flowers_pink', flowerCluster(P.pink[3]!, P.gold[4]!), 3);
decor('decor_flowers_blue', flowerCluster(P.blue[4]!, P.white), 4);
decor('decor_tallgrass', (c, rnd) => {
  for (let i = 0; i < 14; i++) {
    const x = 1 + Math.floor(rnd() * 14);
    const h = 3 + Math.floor(rnd() * 5);
    const y0 = 14 - Math.floor(rnd() * 4);
    for (let k = 0; k < h; k++) c.set(x + (k > h - 2 ? (i % 2 ? 1 : -1) : 0), y0 - k, k > h - 3 ? P.grass[5]! : k > 1 ? P.grass[4]! : P.grass[2]!);
  }
}, 5);
decor('decor_pebbles', (c, rnd) => {
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const y = 2 + Math.floor(rnd() * 12);
    c.set(x, y, P.stone[4]!);
    c.set(x + 1, y, P.stone[3]!);
    c.set(x, y + 1, P.stone[2]!);
    c.set(x + 1, y + 1, P.stone[1]!);
  }
}, 6);
decor('decor_mushrooms', (c) => {
  const cap = (x: number, y: number, col: readonly Color[]) => {
    c.hline(x - 1, x + 1, y, col[3]!);
    c.hline(x - 2, x + 2, y + 1, col[2]!);
    c.set(x - 1, y + 1, P.white);
    c.set(x, y + 2, P.bone[3]!);
    c.set(x, y + 3, P.bone[2]!);
    c.hline(x - 2, x + 2, y + 2, 0);
    c.set(x, y + 2, P.bone[3]!);
  };
  cap(5, 8, P.red);
  cap(10, 10, P.red);
  cap(8, 4, P.fire);
}, 7);
decor('decor_leaves', (c, rnd) => {
  for (let i = 0; i < 7; i++) {
    const x = 1 + Math.floor(rnd() * 14);
    const y = 1 + Math.floor(rnd() * 14);
    const col = [P.fire[3]!, P.fire[2]!, P.gold[3]!, P.dirt[3]!][i % 4]!;
    c.set(x, y, col);
    c.set(x + 1, y, mix(col, P.black, 0.3));
  }
}, 8);
decor('decor_lilypad', (c) => {
  c.ellipse(7, 8, 5, 3.5, P.green[3]!);
  c.ellipse(6.5, 7.5, 3.5, 2.2, P.green[4]!);
  c.line(7, 8, 11, 6, P.water[2]!);
  c.set(9, 6, P.pink[3]!);
  c.set(10, 6, P.white);
  c.set(9, 5, P.pink[2]!);
  c.hline(3, 11, 11, withAlpha(P.water[1]!, 200));
}, 9);
decor('decor_reeds', (c, rnd) => {
  for (let i = 0; i < 6; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const h = 6 + Math.floor(rnd() * 5);
    c.vline(x, 15 - h, 15, P.green[2]!);
    c.set(x, 15 - h, P.dirt[2]!);
    c.set(x, 16 - h, P.dirt[2]!);
    c.set(x, 17 - h, P.dirt[1]!);
  }
}, 10);
decor('decor_crack', (c) => {
  c.line(3, 4, 7, 8, P.dirt[1]!);
  c.line(7, 8, 6, 12, P.dirt[1]!);
  c.line(7, 8, 11, 9, P.dirt[1]!);
}, 11);

// ---------------------------------------------------------------- montagem
export function buildTileset(): { image: PixelCanvas; names: Record<string, number>; columns: number } {
  const columns = 16;
  const all = [{ name: 'empty', canvas: tile() }, ...tiles];
  const rows = Math.ceil(all.length / columns);
  const image = new PixelCanvas(columns * T, rows * T);
  const names: Record<string, number> = {};
  all.forEach((t, i) => {
    image.blit(t.canvas, (i % columns) * T, Math.floor(i / columns) * T);
    if (names[t.name] !== undefined) throw new Error(`Tile duplicado: ${t.name}`);
    names[t.name] = i;
  });
  return { image, names, columns };
}
