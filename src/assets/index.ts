// Ponto único de acesso aos assets gerados (URLs com hash do Vite + metadados JSON).
import tilesUrl from './generated/tiles.png?url';
import objectsUrl from './generated/objects.png?url';
import iconsUrl from './generated/icons.png?url';
import fxUrl from './generated/fx.png?url';
import minimapUrl from './generated/minimap.png?url';
import fontUrl from './generated/font.png?url';
import fontXmlUrl from './generated/font.xml?url';
import objectsJson from './generated/objects.json';
import iconsJson from './generated/icons.json';
import fxJson from './generated/fx.json';
import tilesJson from './generated/tiles.json';
import manifest from './generated/manifest.json';

const sheetUrls = import.meta.glob('./generated/{char,mon}_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const uiUrls = import.meta.glob('./generated/ui_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface SheetInfo {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  columns: number;
  /** humanoid: 4 direções · blob: sem direção, animação contínua · quad: quadrúpede de perfil */
  kind: 'humanoid' | 'blob' | 'quad';
}

export const SHEETS: SheetInfo[] = Object.entries(manifest.sheets).map(([key, s]) => ({
  key,
  url: sheetUrls[`./generated/${s.file}`]!,
  frameWidth: s.frameWidth,
  frameHeight: s.frameHeight,
  frames: s.frames,
  columns: s.columns,
  kind: s.kind as SheetInfo['kind'],
}));

export function uiImage(name: string): string {
  const url = uiUrls[`./generated/ui_${name}.png`];
  if (!url) throw new Error(`Imagem de interface inexistente: ${name}`);
  return url;
}

export const ASSETS = {
  tiles: { url: tilesUrl, names: tilesJson.names as Record<string, number>, columns: tilesJson.columns, size: tilesJson.tileSize },
  objects: { url: objectsUrl, json: objectsJson },
  icons: { url: iconsUrl, json: iconsJson, frames: iconsJson.frames as Record<string, { frame: { x: number; y: number; w: number; h: number } }> },
  fx: { url: fxUrl, json: fxJson, frames: fxJson.frames as Record<string, unknown> },
  font: { url: fontUrl, xmlUrl: fontXmlUrl },
  /** Mundo inteiro reduzido a 4 px por tile (gerado por `npm run art:world`). */
  minimap: { url: minimapUrl, pxPerTile: 4 },
};
