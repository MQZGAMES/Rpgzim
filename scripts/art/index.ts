// Gera todos os assets de pixel art do jogo em src/assets/generated/.
// Uso: npm run art   (determinístico: a mesma entrada produz os mesmos PNGs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PixelCanvas } from './lib/canvas.ts';
import { gridSheet, packAtlas, type AtlasEntry } from './lib/atlas.ts';
import { buildTileset } from './tiles.ts';
import { CHARACTERS, FRAME_H, FRAME_W, buildCharacterSheet } from './characters.ts';
import { BOAR_H, BOAR_W, SLIME_H, SLIME_W, buildBoarFrames, buildSlimeFrames } from './monsters.ts';
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
const manifest: { sheets: Record<string, { file: string; frameWidth: number; frameHeight: number; frames: number; columns: number }> } = { sheets: {} };

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
  manifest.sheets[spec.id] = { file, frameWidth: FRAME_W, frameHeight: FRAME_H, frames: frames.length, columns: 3 };
  charRows.push(gridSheet(frames, FRAME_W, FRAME_H, frames.length));
}

// monstros procedurais
const slime = buildSlimeFrames();
writePng(outDir, 'mon_slime.png', gridSheet(slime, SLIME_W, SLIME_H, slime.length));
manifest.sheets['slime'] = { file: 'mon_slime.png', frameWidth: SLIME_W, frameHeight: SLIME_H, frames: slime.length, columns: slime.length };
const boar = buildBoarFrames();
writePng(outDir, 'mon_boar.png', gridSheet(boar, BOAR_W, BOAR_H, boar.length));
manifest.sheets['boar'] = { file: 'mon_boar.png', frameWidth: BOAR_W, frameHeight: BOAR_H, frames: boar.length, columns: boar.length };

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

// pré-visualizações para documentação (docs/art)
writePng(previewDir, 'preview-tiles.png', tileset.image.scaled(2));
const cp = new PixelCanvas(charRows[0]!.w, charRows.length * FRAME_H);
charRows.forEach((s, i) => cp.blit(s, 0, i * FRAME_H));
writePng(previewDir, 'preview-characters.png', onBg(cp).scaled(3));
const mons = new PixelCanvas(Math.max(slime.length * SLIME_W, boar.length * BOAR_W), SLIME_H + BOAR_H);
mons.blit(gridSheet(slime, SLIME_W, SLIME_H, slime.length), 0, 0);
mons.blit(gridSheet(boar, BOAR_W, BOAR_H, boar.length), 0, SLIME_H);
writePng(previewDir, 'preview-monsters.png', onBg(mons).scaled(4));
writePng(previewDir, 'preview-font.png', onBg(font.image, 0x3a4a5aff).scaled(4));

console.log(`Arte gerada em ${Date.now() - started} ms -> ${outDir}`);
