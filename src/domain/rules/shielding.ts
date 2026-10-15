// Treino de Shielding inspirado no Tibia: com escudo (ou livro de magias) na mão secundária, cada ataque
// recebido conta uma tentativa, mas no máximo de 2 monstros por janela de tempo, e só enquanto o personagem
// estiver lutando (atacou alguém recentemente). Ficar parado apanhando não treina.
import type { BalanceConfig } from '../entities/definitions';

export interface ShieldTrainingState {
  /** Início da janela atual (ms de jogo). */
  windowStart: number;
  /** Atacantes que já contaram nesta janela. */
  sources: string[];
}

export function newShieldTraining(): ShieldTrainingState {
  return { windowStart: -Infinity, sources: [] };
}

/**
 * Decide se este ataque recebido conta para o Shielding e atualiza a janela.
 * Regras: precisa de defesa na mão secundária; o personagem precisa ter atacado nos últimos
 * `shieldingAttackWindowMs`; no máximo `shieldingMaxAttackers` atacantes distintos contam por janela.
 */
export function shieldingTryCounts(
  st: ShieldTrainingState,
  now: number,
  sourceId: string,
  hasShield: boolean,
  lastAttackAt: number,
  cfg: BalanceConfig['combat'],
): boolean {
  if (!hasShield) return false;
  if (now - lastAttackAt > cfg.shieldingAttackWindowMs) return false;
  if (now - st.windowStart >= cfg.shieldingWindowMs) {
    st.windowStart = now;
    st.sources = [];
  }
  if (st.sources.includes(sourceId)) return false;
  if (st.sources.length >= cfg.shieldingMaxAttackers) return false;
  st.sources.push(sourceId);
  return true;
}
