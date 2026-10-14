// Fonte bitmap pixelada (maiúsculas, dígitos, pontuação e acentos do português) com contorno embutido.
// Exporta PNG + XML no formato BMFont, carregado pelo Phaser como BitmapText (nítido em qualquer zoom inteiro).
import { PixelCanvas } from './lib/canvas.ts';
import { P } from './lib/palette.ts';

const G: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##.', '#...', '#.##', '#..#', '.###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  ':': ['.', '#', '.', '#', '.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  "'": ['#', '#', '.', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  '*': ['...', '#.#', '.#.', '#.#', '...'],
  ' ': ['..', '..', '..', '..', '..'],
};

const ACCENT: Record<string, string[]> = {
  acute: ['..#', '.#.'],
  grave: ['#..', '.#.'],
  circ: ['.#.', '#.#'],
  tilde: ['.##', '##.'],
};
const ACCENTED: Record<string, [string, keyof typeof ACCENT]> = {
  Á: ['A', 'acute'], À: ['A', 'grave'], Â: ['A', 'circ'], Ã: ['A', 'tilde'],
  É: ['E', 'acute'], Ê: ['E', 'circ'], Í: ['I', 'acute'], Ó: ['O', 'acute'],
  Ô: ['O', 'circ'], Õ: ['O', 'tilde'], Ú: ['U', 'acute'],
};

const CELL_H = 8; // 2 linhas de acento + 5 de glifo + 1 de descendente
const PAD = 1;

export function buildFont(): { image: PixelCanvas; xml: string; chars: string } {
  const glyphs: { ch: string; rows: string[] }[] = [];
  for (const [ch, rows] of Object.entries(G)) glyphs.push({ ch, rows: ['', '', ...rows] });
  for (const [ch, [base, acc]] of Object.entries(ACCENTED)) {
    const b = G[base]!;
    const w = b[0]!.length;
    const a = ACCENT[acc]!.map((r) => (w > 3 ? '.' + r : r).padEnd(w, '.').slice(0, w));
    glyphs.push({ ch, rows: [...a, ...b] });
  }
  // Ç: C com cedilha
  glyphs.push({ ch: 'Ç', rows: ['', '', ...G['C']!, '.#'] });
  const cols = 16;
  const cellW = 7 + PAD * 2;
  const cellH = CELL_H + PAD * 2;
  const rows = Math.ceil(glyphs.length / cols);
  const image = new PixelCanvas(cols * cellW, rows * cellH);
  const charsXml: string[] = [];
  glyphs.forEach((g, i) => {
    const gx = (i % cols) * cellW;
    const gy = Math.floor(i / cols) * cellH;
    const w = Math.max(...g.rows.map((r) => r.length), 1);
    const cell = new PixelCanvas(w + 2, CELL_H + 2);
    g.rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) if (r[x] === '#') cell.set(x + 1, y + 1, P.white);
    });
    cell.outline(P.outline, true);
    image.blit(cell, gx, gy);
    const code = g.ch.codePointAt(0)!;
    const adv = g.ch === ' ' ? 3 : w + 1;
    charsXml.push(
      `<char id="${code}" x="${gx}" y="${gy}" width="${w + 2}" height="${CELL_H + 2}" xoffset="-1" yoffset="-1" xadvance="${adv}" page="0" chnl="15" />`,
    );
  });
  const xml = `<?xml version="1.0"?>
<font>
  <info face="RpgzimPixel" size="8" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="1,1" />
  <common lineHeight="9" base="7" scaleW="${image.w}" scaleH="${image.h}" pages="1" packed="0" />
  <pages><page id="0" file="font.png" /></pages>
  <chars count="${glyphs.length}">
    ${charsXml.join('\n    ')}
  </chars>
</font>
`;
  return { image, xml, chars: glyphs.map((g) => g.ch).join('') };
}
