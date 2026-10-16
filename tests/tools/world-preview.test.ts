// Ferramenta de desenvolvimento (não roda no `npm test`): renderiza o mundo inteiro em PNG para revisão
// visual do mapa. Uso: npm run art:world
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { buildWorld } from '../../src/data/maps/world';
import { PROPS } from '../../src/data/props';
import { MONSTERS } from '../../src/data/monsters';
import { NPCS } from '../../src/data/npcs';
import { decodePng } from '../../scripts/art/lib/pngdecode.ts';
import { PixelCanvas, channels, pack } from '../../scripts/art/lib/canvas.ts';
import { roofTileName } from '../../src/game/world/roof';
import manifest from '../../src/assets/generated/manifest.json';

const gen = join(process.cwd(), 'src', 'assets', 'generated');
const outDir = process.env.ART_PREVIEW_DIR ?? join(process.cwd(), 'docs', 'art');

test('renderiza o mundo', () => {
  mkdirSync(outDir, { recursive: true });
  const map = buildWorld();
  const tilesImg = decodePng(readFileSync(join(gen, 'tiles.png')));
  const objImg = decodePng(readFileSync(join(gen, 'objects.png')));
  const objJson = JSON.parse(readFileSync(join(gen, 'objects.json'), 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
  const tilesMeta = JSON.parse(readFileSync(join(gen, 'tiles.json'), 'utf8')) as { names: Record<string, number>; columns: number };
  const T = 16;
  const tileCache = new Map<number, PixelCanvas>();
  const tileC = (i: number) => {
    let c = tileCache.get(i);
    if (!c) {
      c = tilesImg.crop((i % tilesMeta.columns) * T, Math.floor(i / tilesMeta.columns) * T, T, T);
      tileCache.set(i, c);
    }
    return c;
  };
  const frame = (name: string) => {
    const f = objJson.frames[name];
    if (!f) throw new Error('frame? ' + name);
    return objImg.crop(f.frame.x, f.frame.y, f.frame.w, f.frame.h);
  };
  const sheet = (id: string, fw: number, fh: number, col = 0) => decodePng(readFileSync(join(gen, id))).crop(col * fw, 0, fw, fh);

  const render = (withRoofs: boolean, withActors = true) => {
    const c = new PixelCanvas(map.width * T, map.height * T);
    for (const layer of ['ground', 'dirt', 'cobble', 'water', 'decor', 'floor', 'walls'] as const) {
      const data = map.layers[layer];
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          const i = data[y * map.width + x]!;
          if (i >= 0) c.blit(tileC(i), x * T, y * T);
        }
    }
    type Drawable = { depth: number; draw: () => void };
    const items: Drawable[] = [];
    for (const p of map.props) {
      const def = PROPS[p.propId]!;
      const img = frame(def.frames[0]!);
      const px = Math.round((p.x + def.width / 2) * T - img.w / 2);
      const py = (p.y + 1) * T - img.h + (def.offsetY ?? 0);
      items.push({ depth: def.flat ? -1 : (p.y + 1) * T, draw: () => c.blit(img, px, py) });
    }
    for (const d of map.doors) {
      const img = frame(`door_${d.style}_closed`);
      items.push({ depth: -2, draw: () => c.blit(img, d.x * T, (d.y + 1) * T - img.h) });
    }
    if (withActors) for (const n of map.npcs) {
      const img = sheet(`char_${NPCS[n.npcId]!.sprite}.png`, 24, 32);
      items.push({ depth: (n.y + 1) * T + 1, draw: () => c.blit(img, n.x * T - 4, (n.y + 1) * T - 32) });
    }
    if (withActors) for (const s of map.spawns) {
      const m = MONSTERS[s.monsterId]!;
      const info = (manifest as { sheets: Record<string, { file: string; frameWidth: number; frameHeight: number }> }).sheets[m.sprite]!;
      const img = sheet(info.file, info.frameWidth, info.frameHeight);
      items.push({ depth: (s.y + 1) * T + 1, draw: () => c.blit(img, s.x * T + 8 - img.w / 2, (s.y + 1) * T - img.h) });
    }
    const start = sheet('char_knight.png', 24, 32);
    if (withActors) items.push({ depth: (map.playerStart.y + 1) * T + 1, draw: () => c.blit(start, map.playerStart.x * T - 4, (map.playerStart.y + 1) * T - 32) });
    items.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());
    if (withRoofs) {
      for (const bld of map.buildings) {
        for (let y = bld.y - 1; y <= bld.y + bld.h - 3; y++)
          for (let x = bld.x; x < bld.x + bld.w; x++) c.blit(tileC(tilesMeta.names[roofTileName(bld, x, y)]!), x * T, y * T);
        if (bld.chimneyX !== undefined) {
          const ch = frame('chimney');
          c.blit(ch, bld.chimneyX * T + 2, (bld.y + 1) * T - ch.h);
        }
      }
    }
    return c;
  };
  writeFileSync(join(outDir, 'world-map.png'), render(true).toPng());
  // mini mapa do jogo: mundo com telhados, sem criaturas, reduzido para 4 px por tile (média de cada bloco)
  const full = render(true, false);
  const F = 4;
  const mini = new PixelCanvas(full.w / F, full.h / F);
  for (let y = 0; y < mini.h; y++)
    for (let x = 0; x < mini.w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < F; dy++)
        for (let dx = 0; dx < F; dx++) {
          const [cr, cg, cb] = channels(full.get(x * F + dx, y * F + dy));
          r += cr;
          g += cg;
          b += cb;
        }
      mini.set(x, y, pack(Math.round(r / (F * F)), Math.round(g / (F * F)), Math.round(b / (F * F))));
    }
  writeFileSync(join(gen, 'minimap.png'), mini.toPng());
});
