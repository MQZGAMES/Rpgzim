// Textos do mundo (nomes, dano, falas) na mesma fonte da interface (Nunito), sempre nítidos:
// o texto é desenhado na resolução física do canvas e reduzido por 1/zoom; a câmera amplia de volta,
// então cada pixel do texto cai exatamente em um pixel da tela, em qualquer zoom.
import type Phaser from 'phaser';
import { devicePixelRatioSafe } from '../config/viewport';

export const WORLD_FONT = '"Nunito Variable", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';

let zoom = 3;
const dpr = devicePixelRatioSafe();
const live = new Set<Phaser.GameObjects.Text>();

export interface WorldTextStyle {
  /** Tamanho em pixels CSS (o que o jogador vê na tela). */
  size: number;
  color?: string;
  weight?: number;
  /** Largura máxima em pixels CSS (quebra de linha). */
  wrap?: number;
  align?: 'left' | 'center' | 'right';
  stroke?: string | null;
}

/**
 * Encaixa um valor do mundo na grade de pixels da tela (1/zoom de pixel do mundo).
 * Textos e sprites desenhados fora dessa grade tremem: o WebGL arredonda os vértices do quad a cada
 * quadro e o desenho "pula" meio pixel, deixando o nome do personagem ilegível enquanto ele anda.
 */
export function snapWorld(v: number): number {
  return Math.round(v * zoom) / zoom;
}

/** Cria um texto do mundo já escalado para o zoom atual (e reescalado automaticamente quando ele muda). */
export function worldText(scene: Phaser.Scene, x: number, y: number, text: string, style: WorldTextStyle): Phaser.GameObjects.Text {
  const px = style.size * dpr;
  const t = scene.add.text(x, y, text, {
    fontFamily: WORLD_FONT,
    fontSize: `${px}px`,
    // o canvas aceita peso numérico ("800") e usa a fonte variável (Nunito Variable) com esse peso
    fontStyle: String(style.weight ?? 800),
    color: style.color ?? '#fbf8ef',
    align: style.align ?? 'center',
    ...(style.stroke === null ? {} : { stroke: style.stroke ?? '#120d18', strokeThickness: Math.max(2, Math.round(px * 0.22)) }),
    ...(style.wrap ? { wordWrap: { width: style.wrap * dpr, useAdvancedWrap: true } } : {}),
  });
  t.setScale(1 / zoom);
  live.add(t);
  t.once('destroy', () => live.delete(t));
  return t;
}

/** Chamado quando o zoom da câmera muda: mantém o tamanho na tela e a nitidez. */
export function setWorldTextZoom(z: number): void {
  if (z === zoom) return;
  zoom = z;
  for (const t of live) t.setScale(1 / zoom);
}

/** Tamanho na tela convertido para pixels do mundo (para posicionar molduras e barras). */
export function cssToWorld(cssPx: number): number {
  return (cssPx * dpr) / zoom;
}

/** Fator de densidade do dispositivo (o texto do mundo é desenhado em pixels físicos). */
export function dprSafe(): number {
  return dpr;
}

/** Garante que a fonte já foi carregada antes do primeiro texto (senão o canvas usa a fonte padrão). */
export function loadWorldFont(timeoutMs = 2000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.race([
    Promise.all([document.fonts.load(`800 24px ${WORLD_FONT}`), document.fonts.load(`600 24px ${WORLD_FONT}`)]).then(() => undefined),
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ]).catch(() => undefined);
}
