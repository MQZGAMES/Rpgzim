// Banco/depósito: guarda itens e ouro com segurança (não se perdem na morte). Regras puras sobre o
// CharacterState; a interação com o NPC e as mensagens ficam na camada de jogo.
import type { CharacterState } from '../entities/character';
import type { GameData } from '../entities/gameData';
import { addItem, removeAt } from './inventory';

export type DepotResult = { ok: true; moved: number } | { ok: false; reason: 'empty' | 'full' | 'gold' };

export const DEPOT_FAIL_MESSAGE: Record<'empty' | 'full' | 'gold', string> = {
  empty: 'Nada para mover.',
  full: 'Sem espaço para guardar este item.',
  gold: 'Quantia de ouro inválida.',
};

/** Garante que o depósito tem a capacidade configurada (saves antigos ou mudanças de balanceamento). */
export function ensureDepotSize(data: GameData, c: CharacterState): void {
  const n = data.balance.player.depotSlots;
  if (c.depot.length < n) c.depot.push(...new Array<null>(n - c.depot.length).fill(null));
}

function move(data: GameData, from: CharacterState['inventory'], index: number, to: CharacterState['inventory']): DepotResult {
  const st = from[index];
  if (!st) return { ok: false, reason: 'empty' };
  const added = addItem(data, to, st.itemId, st.count);
  if (added <= 0) return { ok: false, reason: 'full' };
  removeAt(from, index, added);
  return { ok: true, moved: added };
}

/** Mochila -> depósito (empilha com pilhas existentes). */
export function depositItem(data: GameData, c: CharacterState, invIndex: number): DepotResult {
  ensureDepotSize(data, c);
  return move(data, c.inventory, invIndex, c.depot);
}

/** Depósito -> mochila (o que não couber continua guardado). */
export function withdrawItem(data: GameData, c: CharacterState, depotIndex: number): DepotResult {
  return move(data, c.depot, depotIndex, c.inventory);
}

/** Move toda a mochila para o depósito, exceto poções (úteis na caça). Retorna quantas pilhas foram movidas. */
export function depositAllLoot(data: GameData, c: CharacterState): number {
  ensureDepotSize(data, c);
  let n = 0;
  c.inventory.forEach((st, i) => {
    if (!st) return;
    const def = data.items[st.itemId];
    if (def?.type === 'potion' || def?.type === 'ammo') return;
    if (move(data, c.inventory, i, c.depot).ok) n++;
  });
  return n;
}

export function depositGold(c: CharacterState, amount: number): DepotResult {
  const v = Math.floor(amount);
  if (!(v > 0) || v > c.gold) return { ok: false, reason: 'gold' };
  c.gold -= v;
  c.bankGold += v;
  return { ok: true, moved: v };
}

export function withdrawGold(c: CharacterState, amount: number): DepotResult {
  const v = Math.floor(amount);
  if (!(v > 0) || v > c.bankGold) return { ok: false, reason: 'gold' };
  c.bankGold -= v;
  c.gold += v;
  return { ok: true, moved: v };
}
