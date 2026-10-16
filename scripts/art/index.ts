// Gera todos os assets de pixel art do jogo em src/assets/generated/.
// Uso: npm run art   (determinístico: a mesma entrada produz os mesmos PNGs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PixelCanvas } from './lib/canvas.ts';
import { gridSheet, packAtlas, type AtlasEntry } from './lib/atlas.ts';
import { buildTileset } from './tiles.ts';
import { CHARACTERS, FRAME_H, FRAME_W, buildCharacterSheet } from './characters.ts';
import { BOAR_H, BOAR_W, SLIME_H, SLIME_W, buildBoarFrames, buildSlimeFrames, buildSpiderFrames, buildToadFrames, buildWolfFrames } from './monsters.ts';
import { buildObjects } from './objects.ts';
import { buildIcons } from './icons.ts';
import { buildFx } from './fx.ts';
import { buildUi } from './ui.ts';
import { buildFont } from './font.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'src', 'assets', 'generated');
const previewDir = process.env.ART_PREVIEW_DIR ?? join(root, 'docs', 'art');
mkdirSync(outDir, { recursive: true });
mkdirSync(previewDir, { recursive: true });

const writePng = (dir: string, name: string, c: PixelCanvas) => writeFileSync(join(dir, name), c.toPng());
const writeJson = (name: string, data: unknown) => writeFileSync(join(outDir, name), JSON.stringify(data));
const onBg = (c: PixelCanvas, bg = 0x6f9a52ff) => {
  const b = new PixelCanvas(c.w, c.h).fill(bg >>> 0);
  b.blit(c, 0, 0, { alpha: true });
  return b;
};

const started = Date.now();
const manifest: { sheets: Record<string, { file: string; frameWidth: number; frameHeight: number; frames: number; columns: number; kind: 'humanoid' | 'blob' | 'quad' }> } = { sheets: {} };

// tileset
const tileset = buildTileset();
writePng(outDir, 'tiles.png', tileset.image);
writeJson('tiles.json', { tileSize: 16, columns: tileset.columns, names: tileset.names });

// personagens humanoides: 3 colunas x 5 linhas (baixo, esquerda, direita, cima + caído)
const charRows: PixelCanvas[] = [];
for (const spec of CHARACTERS) {
  const frames = buildCharacterSheet(spec);
  const file = `char_${spec.id}.png`;
  writePng(outDir, file, gridSheet(frames, FRAME_W, FRAME_H, 3));
  manifest.sheets[spec.id] = { file, frameWidth: FRAME_W, frameHeight: FRAME_H, frames: frames.length, columns: 3, kind: 'humanoid' };
  charRows.push(gridSheet(frames, FRAME_W, FRAME_H, frames.length));
}

// monstros procedurais: "blob" (sem direção, animação contínua) e "quad" (quadrúpede de perfil)
const monsterSheets: [string, PixelCanvas[], number, number, 'blob' | 'quad'][] = [
  ['slime', buildSlimeFrames(), SLIME_W, SLIME_H, 'blob'],
  ['toad', buildToadFrames(), 24, 24, 'blob'],
  ['spider', buildSpiderFrames(), 28, 24, 'blob'],
  ['boar', buildBoarFrames(), BOAR_W, BOAR_H, 'quad'],
  ['wolf', buildWolfFrames(), 32, 24, 'quad'],
];
for (const [key, frames, fw, fh, kind] of monsterSheets) {
  const file = `mon_${key}.png`;
  writePng(outDir, file, gridSheet(frames, fw, fh, frames.length));
  manifest.sheets[key] = { file, frameWidth: fw, frameHeight: fh, frames: frames.length, columns: frames.length, kind };
}

// atlases
const atlases: [string, AtlasEntry[], number][] = [
  ['objects', buildObjects(), 512],
  ['icons', buildIcons(), 256],
  ['fx', buildFx(), 512],
];
for (const [name, entries, width] of atlases) {
  const packed = packAtlas(entries, `${name}.png`, width);
  writePng(outDir, `${name}.png`, packed.image);
  writeJson(`${name}.json`, packed.json);
  writePng(previewDir, `preview-${name}.png`, onBg(packed.image, 0x3a4a5aff).scaled(2));
}

// interface (arquivos individuais para CSS border-image)
for (const img of buildUi()) writePng(outDir, `ui_${img.name}.png`, img.canvas);

// fonte bitmap
const font = buildFont();
writePng(outDir, 'font.png', font.image);
writeFileSync(join(outDir, 'font.xml'), font.xml);

writeJson('manifest.json', manifest);

// ícones do aplicativo (favicon e PWA): cavaleiro sobre fundo noturno com moldura dourada
{
  const pub = join(root, 'public');
  mkdirSync(pub, { recursive: true });
  const knight = buildCharacterSheet(CHARACTERS.find((c) => c.id === 'knight')!)[0]!;
  const icon = new PixelCanvas(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const edge = x === 0 || y === 0 || x === 31 || y === 31;
      const edge2 = x === 1 || y === 1 || x === 30 || y === 30;
      icon.set(x, y, edge ? 0x1d1626ff : edge2 ? 0xe0b03aff : y > 24 ? 0x33703cff : 0x33205cff);
    }
  icon.blit(knight, 4, -1, { alpha: true });
  writePng(pub, 'favicon.png', icon);
  writePng(pub, 'icon-192.png', icon.scaled(6));
  writePng(pub, 'icon-512.png', icon.scaled(16));
  // iPhone/iPad (tela de início): sem transparência e sem moldura — o iOS arredonda os cantos sozinho.
  // Android "maskable": o personagem fica dentro da área segura central (o sistema recorta em círculo/gota).
  const fullBleed = (size: number, kx: number, ky: number) => {
    const c = new PixelCanvas(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) c.set(x, y, y > size * 0.74 ? 0x33703cff : y > size * 0.7 ? 0x4e9440ff : 0x33205cff);
    // estrelinhas no céu
    for (const [sx, sy] of [[4, 4], [size - 6, 6], [size - 10, 2], [7, 11]] as const) c.set(sx, sy, 0xe2dce6ff);
    c.blit(knight, kx, ky, { alpha: true });
    return c;
  };
  writePng(pub, 'apple-touch-icon.png', fullBleed(36, 6, 2).scaled(5)); // 180x180
  writePng(pub, 'icon-maskable-480.png', fullBleed(40, 8, 5).scaled(12)); // 480x480
}

// pré-visualizações para documentação (docs/art)
writePng(previewDir, 'preview-tiles.png', tileset.image.scaled(2));
const cp = new PixelCanvas(charRows[0]!.w, charRows.length * FRAME_H);
charRows.forEach((s, i) => cp.blit(s, 0, i * FRAME_H));
writePng(previewDir, 'preview-characters.png', onBg(cp).scaled(3));
const mons = new PixelCanvas(5 * 32, monsterSheets.length * 24);
monsterSheets.forEach(([, frames, fw, fh], i) => mons.blit(gridSheet(frames, fw, fh, frames.length), 0, i * 24));
writePng(previewDir, 'preview-monsters.png', onBg(mons).scaled(4));
writePng(previewDir, 'preview-font.png', onBg(font.image, 0x3a4a5aff).scaled(4));

console.log(`Arte gerada em ${Date.now() - started} ms -> ${outDir}`);
