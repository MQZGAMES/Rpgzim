// Jeito de gente: o que faz um herói parecer uma pessoa jogando, e não um robô perfeito. Cada herói tem um perfil
// fixo (tirado do temperamento e do id): tempo de reação, ritmo de magias, jeito de escrever no chat e o tamanho das
// sessões de jogo e das pausas. A IA (heroBrain) usa o perfil para reagir com um atraso humano, falar do jeito dele,
// fazer pausas, ficar AFK de vez em quando e deslogar/voltar como um jogador de verdade.
import type { HeroDef } from '../../domain/entities/definitions';

/** Jeito de escrever: animado (exclamações), casual (gírias, abreviações, sem acento), educado, seco (curto, sem festa). */
export type ChatStyle = 'animado' | 'casual' | 'educado' | 'seco';

export interface HumanProfile {
  /** Tempo de reação (ms) para o que não é emergência: beber a poção, puxar o próximo alvo. */
  reactionMs: number;
  /** Fração das brechas para magia que ele aproveita fora de aperto (ninguém aperta todo botão a cada segundo). */
  apm: number;
  style: ChatStyle;
  /** Duração de uma sessão de jogo (min) antes de dar uma pausa e deslogar. */
  sessionMin: readonly [number, number];
  /** Duração da pausa fora do jogo (min). */
  breakMin: readonly [number, number];
  /** Chance de ficar AFK alguns minutos ao terminar uma visita à vila. */
  afkChance: number;
}

/** Os heróis da casa têm o jeito de escrever deles; os personagens criados ganham um pelo id. */
const STYLE_OF: Record<string, ChatStyle> = {
  boladex: 'animado',
  maguim: 'casual',
  mano_cura: 'educado',
  distanciado: 'seco',
};
const STYLES: readonly ChatStyle[] = ['animado', 'casual', 'educado', 'seco'];

/** Número estável em [0, 1) a partir de um texto (o mesmo herói tem sempre o mesmo perfil). */
function frac(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 10000) / 10000;
}

export function humanProfile(hero: Pick<HeroDef, 'id' | 'temperament'>): HumanProfile {
  const t = hero.temperament;
  return {
    // o prudente percebe a vida baixa mais rápido; o afoito demora mais
    reactionMs: Math.round(230 + (1 - t.caution) * 260 + frac(hero.id, 1) * 140),
    apm: 0.86 + t.discipline * 0.12,
    style: STYLE_OF[hero.id] ?? STYLES[Math.floor(frac(hero.id, 2) * STYLES.length)]!,
    // quem é disciplinado joga sessões mais longas; o sociável para mais vezes para conversar (AFK)
    sessionMin: [Math.round(45 + t.discipline * 30), Math.round(80 + t.discipline * 35)],
    breakMin: [6, Math.round(14 + (1 - t.discipline) * 10)],
    afkChance: 0.04 + t.sociability * 0.08,
  };
}

/** Palavra inteira (com acento: o \b do JavaScript não entende "você"). */
const word = (w: string) => new RegExp(String.raw`(?<!\p{L})${w}(?!\p{L})`, 'giu');
const ABBREV: readonly (readonly [RegExp, string])[] = [
  [word('você'), 'vc'],
  [word('porque'), 'pq'],
  [word('também'), 'tb'],
  [word('beleza'), 'blz'],
  [word('valeu'), 'vlw'],
  [word('muito'), 'mt'],
  [word('estou'), 'to'],
  [word('está'), 'ta'],
  [word('para'), 'pra'],
  [word('falou'), 'flw'],
  [word('quando'), 'qnd'],
];

const ACCENTS: Record<string, string> = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ç: 'c' };

/** Tira os acentos (no chat muita gente escreve assim). */
export const stripAccents = (s: string): string => s.replace(/[áàâãéêíóôõúç]/gi, (c) => {
  const plain = ACCENTS[c.toLowerCase()] ?? c;
  return c === c.toLowerCase() ? plain : plain.toUpperCase();
});

/**
 * Reescreve uma fala no jeito do herói. `roll` sorteia (0..1): a mesma fala sai um pouco diferente a cada vez, como
 * gente digitando. `light` marca as falas de brincadeira (matou, morreu, achou loot), que ganham um "kkk".
 */
export function styleLine(text: string, style: ChatStyle, roll: () => number, light = false): string {
  let s = text;
  switch (style) {
    case 'casual':
      for (const [re, to] of ABBREV) if (roll() < 0.7) s = s.replace(re, to);
      if (roll() < 0.45) s = stripAccents(s);
      if (roll() < 0.6) s = s.charAt(0).toLowerCase() + s.slice(1);
      s = s.replace(/\.$/, '');
      if (light && roll() < 0.35) s = `${s.replace(/[!.]+$/, '')} kkk`;
      return s;
    case 'animado':
      if (roll() < 0.35) s = s.replace(/!$/, '!!');
      if (light && roll() < 0.2) s = `${s} haha`;
      return s;
    case 'seco':
      s = s.replace(/!+/g, '.').replace(/\.\.\.\./g, '...');
      return s.replace(/ (haha|kkk)$/i, '');
    default:
      return s;
  }
}
