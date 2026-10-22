// Papéis dos heróis por vocação: como cada um luta (distância, magias), do que precisa estocar e o peso do dano
// que a régua de ameaça deve contar. Dados puros — o cérebro (heroBrain) lê daqui.
import type { VocationId } from '../../domain/value-objects/ids';

export interface RoleProfile {
  /** Luta de longe: mantém esta distância (tiles) de quem bate corpo a corpo; 0 = corpo a corpo. */
  keepDistance: number;
  /** Estoque de mana desejado, em múltiplos da mana máxima (0 = não compra). */
  manaStock: number;
  /** Multiplicador do dano por segundo na régua (magias e rajadas somam além do golpe básico). */
  dpsMul: number;
  /** Treina com a arma de treino quando está atrasado nas skills. */
  trains: boolean;
}

export const ROLES: Readonly<Record<VocationId, RoleProfile>> = {
  knight: { keepDistance: 0, manaStock: 0, dpsMul: 1, trains: true },
  paladin: { keepDistance: 3, manaStock: 0.6, dpsMul: 1.2, trains: false },
  sorcerer: { keepDistance: 3, manaStock: 2.5, dpsMul: 1.45, trains: false },
  druid: { keepDistance: 3, manaStock: 2.5, dpsMul: 1.25, trains: false },
};

export const isRanged = (v: VocationId): boolean => ROLES[v].keepDistance > 0;
