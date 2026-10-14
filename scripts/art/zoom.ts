// Ferramenta de inspeção: recorta e amplia uma região de um PNG.
// Uso: node scripts/art/zoom.ts <entrada.png> <saida.png> x y w h escala [corDeFundoRRGGBBAA]
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from './lib/pngdecode.ts';
import { PixelCanvas } from './lib/canvas.ts';

const [, , src, out, x, y, w, h, s, bg] = process.argv;
const img = decodePng(readFileSync(src!));
const c = img.crop(Number(x), Number(y), Number(w), Number(h));
const b = new PixelCanvas(c.w, c.h).fill(parseInt(bg ?? '6f9a52ff', 16) >>> 0);
b.blit(c, 0, 0);
writeFileSync(out!, b.scaled(Number(s)).toPng());
