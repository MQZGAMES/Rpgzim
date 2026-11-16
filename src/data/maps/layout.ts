// Geometria do mundo (nov/2026): Pedraluz no centro e quatro direções ao redor. A dificuldade cresce com a distância
// até a muralha da vila, em qualquer direção (anéis), e cada direção tem uma sequência própria de biomas.
//
//                         N  gelo: campos → taiga → tundra → geleira → pico do inverno
//   W  montanhas: colinas → ruínas → montanhas → charneca → abismo        E  sol: campos → savana → deserto → dunas → vulcão
//                         S  água: margem → pântano → selva alagada → pântano corrompido → necrópole

export const WORLD_W = 245;
export const WORLD_H = 250;
/** Canto superior esquerdo do desenho da vila (ela é montada em coordenadas locais 0–72 × 0–77). */
export const TOWN_X = 86;
export const TOWN_Y = 86;
/** Coordenadas do desenho da vila (local) no mundo. */
export const town = (x: number, y: number): { x: number; y: number } => ({ x: x + TOWN_X, y: y + TOWN_Y });
/** Ponto de partida (dentro do Templo da Aurora): onde nasce todo personagem novo ou recomeçado. */
export const PLAYER_START = { x: 47 + TOWN_X, y: 11 + TOWN_Y } as const;
/** Muralha (paliçada) da vila no mundo: a distância das zonas de caça é medida a partir dela. */
export const TOWN_BOX = { x0: TOWN_X + 2, y0: TOWN_Y + 2, x1: TOWN_X + 72, y1: TOWN_Y + 77 } as const;
/** Centro da vila. */
export const TOWN_CX = Math.round((TOWN_BOX.x0 + TOWN_BOX.x1) / 2);
export const TOWN_CY = Math.round((TOWN_BOX.y0 + TOWN_BOX.y1) / 2);
export { WORLD_VERSION } from '../../domain/rules/worldVersion';

export type Sector = 'N' | 'E' | 'S' | 'W';
export const SECTORS: readonly Sector[] = ['N', 'E', 'S', 'W'];

/** Anéis de distância (em tiles a partir da muralha) e a faixa de nível das criaturas de cada um. */
export const RINGS = [
  { d0: 1, d1: 14, levels: [1, 8] },
  { d0: 15, d1: 30, levels: [9, 20] },
  { d0: 31, d1: 48, levels: [20, 42] },
  { d0: 49, d1: 65, levels: [44, 71] },
  { d0: 66, d1: 99, levels: [72, 103] },
] as const;

/** Distância até a muralha (0 = dentro da vila) e os afastamentos horizontal e vertical. */
export function townDistance(x: number, y: number): { d: number; dx: number; dy: number } {
  const dx = Math.max(TOWN_BOX.x0 - x, x - TOWN_BOX.x1, 0);
  const dy = Math.max(TOWN_BOX.y0 - y, y - TOWN_BOX.y1, 0);
  return { d: Math.max(dx, dy), dx, dy };
}

/** Direção da célula (a que domina: norte/sul se o afastamento vertical for maior); null dentro da vila. */
export function sectorAt(x: number, y: number, bias = 0): Sector | null {
  const { dx, dy } = townDistance(x, y);
  if (dx === 0 && dy === 0) return null;
  if (dy + bias > dx || (dy + bias === dx && (x + y) % 2 === 0)) return y < TOWN_BOX.y0 ? 'N' : 'S';
  return x < TOWN_BOX.x0 ? 'W' : 'E';
}

/** Anel (0–4) de uma distância. */
export function ringOf(d: number): number {
  for (let i = 0; i < RINGS.length; i++) if (d <= RINGS[i]!.d1) return i;
  return RINGS.length - 1;
}

/**
 * Ponto de um braço: `d` tiles além da muralha, na direção `s`, e `t` (−1 a 1) de lado a lado do braço (0 = no meio,
 * sobre a estrada; o braço se alarga a 45° conforme se afasta da vila).
 */
export function armPoint(s: Sector, d: number, t: number): { x: number; y: number } {
  const halfNS = (TOWN_BOX.x1 - TOWN_BOX.x0) / 2 + d - 4;
  const halfEW = (TOWN_BOX.y1 - TOWN_BOX.y0) / 2 + d - 4;
  const r = (v: number) => Math.round(v);
  switch (s) {
    case 'N':
      return { x: r(TOWN_CX + t * halfNS), y: TOWN_BOX.y0 - d };
    case 'S':
      return { x: r(TOWN_CX + t * halfNS), y: TOWN_BOX.y1 + d };
    case 'E':
      return { x: TOWN_BOX.x1 + d, y: r(TOWN_CY + t * halfEW) };
    default:
      return { x: TOWN_BOX.x0 - d, y: r(TOWN_CY + t * halfEW) };
  }
}
