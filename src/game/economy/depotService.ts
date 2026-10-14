// Banco/depósito junto ao banqueiro: valida a interação (janela aberta, jogador vivo) e aplica as regras
// do domínio. Num servidor autoritativo estas mesmas funções seriam os handlers dos comandos.
import { DEPOT_FAIL_MESSAGE, depositAllLoot, depositGold, depositItem, ensureDepotSize, withdrawGold, withdrawItem, type DepotResult } from '../../domain/rules/depot';
import type { World } from '../simulation/World';
import { message, warnThrottled } from '../simulation/World';

function canUse(w: World): boolean {
  if (!w.ui.depot || w.player.dead) {
    warnThrottled(w, 'depot', 'Fale com o banqueiro para usar o depósito.', 800);
    return false;
  }
  ensureDepotSize(w.data, w.player.character);
  return true;
}

function report(w: World, res: DepotResult, ok: () => string): boolean {
  if (!res.ok) {
    warnThrottled(w, `depot:${res.reason}`, DEPOT_FAIL_MESSAGE[res.reason], 600);
    return false;
  }
  message(w, ok(), 'info');
  w.events.emit('itemsChanged', {});
  w.events.emit('saveRequested', { reason: 'depot' });
  return true;
}

export function depotDeposit(w: World, invIndex: number): boolean {
  if (!canUse(w)) return false;
  const c = w.player.character;
  const name = w.data.items[c.inventory[invIndex]?.itemId ?? '']?.name ?? '';
  const res = depositItem(w.data, c, invIndex);
  return report(w, res, () => `Guardado no depósito: ${res.ok && res.moved > 1 ? `${res.moved}x ` : ''}${name}.`);
}

export function depotWithdraw(w: World, depotIndex: number): boolean {
  if (!canUse(w)) return false;
  const c = w.player.character;
  const name = w.data.items[c.depot[depotIndex]?.itemId ?? '']?.name ?? '';
  const res = withdrawItem(w.data, c, depotIndex);
  if (!res.ok && res.reason === 'full') {
    warnThrottled(w, 'depot:bagfull', 'Sem espaço na mochila.', 600);
    return false;
  }
  return report(w, res, () => `Retirado do depósito: ${res.ok && res.moved > 1 ? `${res.moved}x ` : ''}${name}.`);
}

export function depotDepositAll(w: World): boolean {
  if (!canUse(w)) return false;
  const n = depositAllLoot(w.data, w.player.character);
  if (n === 0) {
    warnThrottled(w, 'depot:none', 'Nada para guardar (poções e flechas ficam na mochila).', 800);
    return false;
  }
  return report(w, { ok: true, moved: n }, () => `${n} ${n === 1 ? 'item guardado' : 'itens guardados'} no depósito.`);
}

export function bankGold(w: World, op: 'deposit' | 'withdraw', amount: number): boolean {
  if (!canUse(w)) return false;
  const c = w.player.character;
  const res = op === 'deposit' ? depositGold(c, amount) : withdrawGold(c, amount);
  const ok = report(w, res, () => (op === 'deposit' ? `Depositado: ${amount} de ouro. Saldo no banco: ${c.bankGold}.` : `Sacado: ${amount} de ouro. Saldo no banco: ${c.bankGold}.`));
  if (ok) w.events.emit('goldChanged', { amount: c.gold, delta: op === 'deposit' ? -amount : amount });
  return ok;
}
