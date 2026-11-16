// Ajustes de preço (nov/2026), aplicados num lugar só: no `value` dos itens (Mercado, IA) e no preço das lojas.
// - Poção de mana 30% mais barata: com a mana natural fixa por vocação, ela virou o maior gasto dos magos
//   (~0,8 de ouro por ponto contra 0,5 da poção de vida; agora ~0,55).
// - Equipamento dos níveis 8 a 23 35% mais barato: o conjunto custava 150–300 abates numa fase em que o herói sobe de
//   nível a cada 30–50 abates (a loja não acompanhava).
import type { ItemDef } from '../domain/entities/definitions';

export const MANA_POTION_DISCOUNT = 0.7;
export const EARLY_GEAR_DISCOUNT = 0.65;
/**
 * Preço de cada poção de mana (≈ 30% abaixo do anterior), fixado à mão para a maior nunca custar mais por ponto que a
 * menor: 34/60 = 0,567 · 84/150 = 0,56 · 168/300 = 0,56 · 280/500 = 0,56 · 504/900 = 0,56.
 */
export const MANA_POTION_PRICE: Readonly<Record<string, number>> = {
  potion_mana: 34,
  potion_mana_great: 84,
  potion_mana_supreme: 168,
  potion_mana_spirit: 280,
  potion_mana_divine: 504,
};

/** Fator de preço do item (1 = sem ajuste). */
export function priceFactor(item: Pick<ItemDef, 'id' | 'slot' | 'minLevel'> | undefined): number {
  if (!item) return 1;
  if (item.id.startsWith('potion_mana')) return MANA_POTION_DISCOUNT;
  const lv = item.minLevel ?? 1;
  if (item.slot && lv >= 8 && lv < 24) return EARLY_GEAR_DISCOUNT;
  return 1;
}

/** Preço já ajustado (arredondado). */
export function adjustedPrice(item: Pick<ItemDef, 'id' | 'slot' | 'minLevel'> | undefined, price: number): number {
  if (item && MANA_POTION_PRICE[item.id] !== undefined) return MANA_POTION_PRICE[item.id]!;
  return Math.max(1, Math.round(price * priceFactor(item)));
}
