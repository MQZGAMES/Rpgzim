// Pré-visualização de cenas compostas com o tileset (para validar autotile e coerência visual).
// Uso: node scripts/art/preview.ts <saida.png> [escala]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PixelCanvas } from './lib/canvas.ts';
import { decodePng } from './lib/pngdecode.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gen = join(root, 'src', 'assets', 'generated');
const out = process.argv[2] ?? join(root, 'preview.png');
const scale = Number(process.argv[3] ?? 4);

const tilesImg = decodePng(readFileSync(join(gen, 'tiles.png')));
const tilesMeta = JSON.parse(readFileSync(join(gen, 'tiles.json'), 'utf8')) as { names: Record<string, number>; columns: number };

const W = 24;
const H = 16;
// legenda: g grama, d terra, c calçamento, w água
const map = [
  'gggggggggggggggggggggggg',
  'gggggggggggdddgggggggggg',
  'ggggggwwwggdddgggccccggg',
  'gggggwwwwwgdddgggccccggg',
  'ggggwwwwwwwdddddddccccgg',
  'gggggwwwwwwgggggggccccgg',
  'ggggggwwwgggggggggggcggg',
  'ggggggggggggddddgggggggg',
  'gggggggggggggdddddgggggg',
  'ggdgggggggggggggdddddggg',
  'ggddddddddddddddddgggggg',
  'gggggggggggggggggggggggg',
  'gggwwwwgggggggcccccggggg',
  'ggwwwwwwggggggcccccggggg',
  'gggwwwwgggggggcccccggggg',
  'gggggggggggggggggggggggg',
];
const scene = new PixelCanvas(W * 16, H * 16);
const drawTile = (name: string, tx: number, ty: number) => {
  const idx = tilesMeta.names[name];
  if (idx === undefined) throw new Error('tile? ' + name);
  const sx = (idx % tilesMeta.columns) * 16;
  const sy = Math.floor(idx / tilesMeta.columns) * 16;
  scene.blit(tilesImg.crop(sx, sy, 16, 16), tx * 16, ty * 16);
};
const cell = (x: number, y: number) => map[Math.max(0, Math.min(H - 1, y))]![Math.max(0, Math.min(W - 1, x))]!;
const vert = (x: number, y: number, t: string, all: boolean) => {
  const cs = [cell(x - 1, y - 1), cell(x, y - 1), cell(x - 1, y), cell(x, y)];
  return all ? cs.every((c) => c === t) : cs.some((c) => c === t);
};
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    drawTile(`grass_${(x * 7 + y * 13) % 6}`, x, y);
    for (const [t, name, all] of [['d', 'dirt', false], ['c', 'cobble', false], ['w', 'water_0', true]] as const) {
      const cfg =
        (vert(x, y, t, all) ? 1 : 0) | (vert(x + 1, y, t, all) ? 2 : 0) | (vert(x, y + 1, t, all) ? 4 : 0) | (vert(x + 1, y + 1, t, all) ? 8 : 0);
      const vh = (x * 31 + y * 17) % 4;
      const variant = cfg === 15 && name !== 'water_0' && vh > 0 ? (name === 'dirt' ? ['', '', '_b', '_c'][vh] : ['', '_b', '_c', '_d'][vh]) : '';
      if (cfg) drawTile(`${name}_${cfg}${variant}`, x, y);
    }
  }
writeFileSync(out, scene.scaled(scale).toPng());
console.log('preview ->', out);
