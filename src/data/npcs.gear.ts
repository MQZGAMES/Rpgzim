// Equipamentos do nível 24 ao 100 e poções de alto nível à venda em Pedraluz (única cidade). As peças de luta vão
// para a Ferraria e as de mago para a Alquimia; as lojas também compram os troféus das criaturas pelo valor cheio.
import type { ShopDef } from '../domain/entities/definitions';
import { GEAR_ITEMS } from './items.gear';
import { TROPHY_ITEMS } from './monsters.late';

const sellPct = (price: number) => Math.max(1, Math.round(price * 0.35));
const MAGE_KINDS = ['wand_', 'rod_', 'spellbook_', 'robe_', 'hat_', 'legs_mage_', 'ring_wisdom_', 'amulet_mage_'];
const isMageGear = (id: string) => MAGE_KINDS.some((k) => id.startsWith(k));

const fighter = GEAR_ITEMS.filter((i) => !!i.slot && !isMageGear(i.id));
const mage = GEAR_ITEMS.filter((i) => !!i.slot && isMageGear(i.id));
const POTIONS: [string, number][] = [['potion_health_spirit', 520], ['potion_health_divine', 1100], ['potion_mana_spirit', 540], ['potion_mana_divine', 1100]];

/** Acrescenta as faixas tardias às lojas de Pedraluz. */
export function withLateStock(shops: ShopDef[]): ShopDef[] {
  return shops.map((s) => {
    if (s.id === 'equipment') return { ...s, sells: [...s.sells, ...fighter.map((i) => ({ itemId: i.id, price: i.value }))], buys: [...s.buys, ...GEAR_ITEMS.map((i) => ({ itemId: i.id, price: sellPct(i.value) }))] };
    if (s.id === 'potions')
      return { ...s, sells: [...s.sells, ...mage.map((i) => ({ itemId: i.id, price: i.value })), ...POTIONS.map(([itemId, price]) => ({ itemId, price }))], buys: [...s.buys, ...TROPHY_ITEMS.map((i) => ({ itemId: i.id, price: i.value })), ...POTIONS.map(([itemId, price]) => ({ itemId, price: Math.floor(price / 2) }))] };
    if (s.id === 'general') return { ...s, buys: [...s.buys, ...TROPHY_ITEMS.map((i) => ({ itemId: i.id, price: i.value }))] };
    return s;
  });
}
