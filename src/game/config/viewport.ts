// Escala pixel-perfect: o canvas usa a resolução física do dispositivo e a câmera um zoom inteiro,
// garantindo uma área útil mínima de tiles em qualquer proporção de tela.
export const TILE = 16;

export interface ViewportInfo {
  /** Pixels físicos do canvas. */
  width: number;
  height: number;
  dpr: number;
  zoom: number;
}

/**
 * Resolução interna do canvas. Limitada a 2x: em telas 3x o navegador amplia 1,5x com "pixelated"
 * e, com zoom de câmera par, cada pixel do jogo continua ocupando um número inteiro de pixels físicos.
 * Reduz o custo de preenchimento em ~55% nos celulares de alta densidade.
 */
export function devicePixelRatioSafe(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.min(2, dpr));
}

/** Maior zoom inteiro que ainda mostra pelo menos `minTiles` no eixo curto e um pouco mais no longo. */
export function computeZoom(widthPx: number, heightPx: number, minShortTiles = 11, minLongTiles = 15): number {
  const portrait = heightPx > widthPx;
  const tilesW = portrait ? minShortTiles : minLongTiles;
  const tilesH = portrait ? minLongTiles : minShortTiles;
  const z = Math.floor(Math.min(widthPx / (TILE * tilesW), heightPx / (TILE * tilesH)));
  return Math.max(1, z);
}
