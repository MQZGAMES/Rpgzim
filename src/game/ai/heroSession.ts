// Estilo de jogo da sessão: cada vez que um herói entra no jogo ele "decide" como vai jogar hoje, como gente de
// verdade. Uns querem subir de nível rápido (gastam mais poção e arriscam caças que rendem mais XP), outros caçam
// atrás de loot e equipamento, outros fazem comércio no mercado, outros querem grupo, e uma minoria sai para matar
// gente (PK). O temperamento pesa no sorteio, mas não decide sozinho: o mesmo herói varia de um dia para o outro.
// Ninguém fica parado na vila: todo estilo caça; o que muda é o que ele valoriza.
// Aqui também fica a memória de quem matou cada herói (dura entre as sessões, enquanto o mundo está aberto).
import type { Temperament } from '../../domain/entities/definitions';

export type SessionStyle = 'leveler' | 'looter' | 'merchant' | 'social' | 'pker' | 'balanced';

export interface SessionPlan {
  style: SessionStyle;
  startedAt: number;
}

export const SESSION_LABEL: Record<SessionStyle, string> = {
  leveler: 'focado em upar',
  looter: 'caçando loot',
  merchant: 'fazendo comércio',
  social: 'procurando grupo',
  pker: 'caçando jogadores',
  balanced: 'de boa',
};

/** Peso de cada estilo para este temperamento (o PK é sempre minoria e só para quem tem coragem ou ganância). */
export function sessionWeights(t: Temperament): Record<SessionStyle, number> {
  const pkProne = t.bravery >= 0.55 || t.greed >= 0.65;
  return {
    leveler: 0.25 + t.discipline * 0.3,
    looter: 0.15 + t.greed * 0.35,
    merchant: 0.05 + t.greed * 0.12 + t.discipline * 0.05,
    social: 0.08 + t.sociability * 0.3,
    pker: pkProne ? 0.03 + t.greed * 0.04 + t.bravery * 0.03 : 0,
    balanced: 0.22,
  };
}

/** Sorteia o estilo de hoje (`roll` em [0, 1)). */
export function rollSession(t: Temperament, roll: number, now: number): SessionPlan {
  const weights = sessionWeights(t);
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  let left = roll * total;
  for (const [style, v] of Object.entries(weights) as [SessionStyle, number][]) {
    left -= v;
    if (left < 0) return { style, startedAt: now };
  }
  return { style: 'balanced', startedAt: now };
}

/** Efeitos práticos do estilo na IA. */
export interface SessionTuning {
  /** Níveis a mais (ou a menos) que ele aceita na caça. */
  huntLevel: number;
  /** Peso do loot (0..1) contra a XP na escolha da caça. */
  lootWeight: number;
  /** Multiplica o estoque de poção que ele leva (quem quer upar rápido gasta mais). */
  potionStock: number;
  /** A partir de quantos níveis abaixo dele a presa já "não rende" (foco em XP). */
  weakGap: number;
  /** Vontade a mais de fazer grupo e de atacar jogadores (PK). */
  groupBias: number;
  pkBias: number;
}

export function sessionTuning(style: SessionStyle | undefined): SessionTuning {
  switch (style) {
    case 'leveler':
      return { huntLevel: 1.5, lootWeight: 0, potionStock: 1.35, weakGap: 5, groupBias: 0.1, pkBias: 0 };
    case 'looter':
      return { huntLevel: 0, lootWeight: 0.6, potionStock: 1, weakGap: 12, groupBias: 0, pkBias: 0 };
    case 'merchant':
      return { huntLevel: -0.5, lootWeight: 0.35, potionStock: 0.9, weakGap: 10, groupBias: 0, pkBias: 0 };
    case 'social':
      return { huntLevel: 0, lootWeight: 0, potionStock: 1, weakGap: 8, groupBias: 0.35, pkBias: 0 };
    case 'pker':
      return { huntLevel: 0.5, lootWeight: 0.2, potionStock: 1.2, weakGap: 8, groupBias: -0.1, pkBias: 0.45 };
    default:
      // equilibrado: igual à IA de antes dos estilos
      return { huntLevel: 0, lootWeight: 0, potionStock: 1, weakGap: 8, groupBias: 0, pkBias: 0 };
  }
}

// ------------------------------------------------------------------ memória de mortes (vingança entre sessões)
export interface KillMemory {
  count: number;
  last: number;
}

/** Quem matou quem (id do personagem morto -> id do matador -> vezes e a última), enquanto o mundo existir. */
const kills = new WeakMap<object, Map<string, Record<string, KillMemory>>>();

function store(world: object): Map<string, Record<string, KillMemory>> {
  let m = kills.get(world);
  if (!m) kills.set(world, (m = new Map()));
  return m;
}

export function rememberKill(world: object, victimId: string, killerId: string, now: number): void {
  const mine = store(world).get(victimId) ?? {};
  const k = mine[killerId] ?? { count: 0, last: 0 };
  mine[killerId] = { count: k.count + 1, last: now };
  store(world).set(victimId, mine);
}

/** Ele matou de volta: a conta diminui (vingança cumprida). */
export function settleKill(world: object, victimId: string, killerId: string): void {
  const mine = store(world).get(victimId);
  const k = mine?.[killerId];
  if (!mine || !k) return;
  if (k.count <= 1) delete mine[killerId];
  else k.count -= 1;
}

/** A maior conta em aberto (quem mais o matou, com a mais recente desempatando), ou null. */
export function worstKiller(world: object, victimId: string): { id: string; count: number } | null {
  const mine = store(world).get(victimId);
  if (!mine) return null;
  let best: { id: string; count: number; last: number } | null = null;
  for (const [id, k] of Object.entries(mine))
    if (!best || k.count > best.count || (k.count === best.count && k.last > best.last)) best = { id, ...k };
  return best ? { id: best.id, count: best.count } : null;
}
