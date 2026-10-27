// Treino entre membros do grupo: enquanto o ataque entre membros está em "treino", cada membro troca a arma pela de
// treino (ou pela mais fraca que tiver na mochila) e volta à arma de antes quando o treino acaba ou ele sai do grupo.
// (As regras de dano — parar com 50% de vida — ficam no combate.)
import { canUseItem, itemScore } from '../../domain/rules/itemPower';
import type { PlayerEntity } from '../entities/types';
import { equipItem } from '../inventory/inventoryService';
import type { World } from '../simulation/World';
import { asActor } from '../simulation/World';
import { actorById, allParties } from './social';

const nextCheck = new WeakMap<World, number>();

/** Está num grupo com o ataque entre membros em modo treino? */
export function inTraining(w: World, id: string): boolean {
  return allParties(w).some((p) => p.members.includes(id) && p.friendlyFire && p.sparMode !== 'duel');
}

/** Valor de comparação: armas de treino sempre são as "mais fracas". */
function weakness(w: World, itemId: string): number {
  const d = w.data.items[itemId]!;
  return d.weapon?.training ? -1 : itemScore(d);
}

function equipWeakest(w: World, a: PlayerEntity): void {
  const c = a.character;
  const cur = c.equipment.mainHand;
  const pool: { itemId: string; idx: number }[] = [];
  c.inventory.forEach((st, idx) => {
    const d = st && w.data.items[st.itemId];
    if (st && d?.weapon && d.slot === 'mainHand' && canUseItem(d, c)) pool.push({ itemId: st.itemId, idx });
  });
  if (!pool.length) return;
  const best = pool.sort((x, y) => weakness(w, x.itemId) - weakness(w, y.itemId))[0]!;
  if (cur && weakness(w, cur.itemId) <= weakness(w, best.itemId)) return; // já está com a mais fraca
  if (!w.social.sparGear.has(a.id) && cur && !w.data.items[cur.itemId]?.weapon?.training) {
    w.social.sparGear.set(a.id, { main: cur.itemId, off: c.equipment.offHand?.itemId ?? null });
  }
  asActor(w, a, () => equipItem(w, best.idx));
}

function restore(w: World, id: string): void {
  const saved = w.social.sparGear.get(id);
  w.social.sparGear.delete(id);
  const a = actorById(w, id);
  if (!saved || !a) return;
  const c = a.character;
  const find = (itemId: string | null) => (itemId ? c.inventory.findIndex((st) => st?.itemId === itemId) : -1);
  asActor(w, a, () => {
    const m = find(saved.main);
    if (m >= 0) equipItem(w, m);
    const o = find(saved.off);
    if (o >= 0 && !c.equipment.offHand) equipItem(w, o);
  });
}

/** Chamado a cada passo da simulação (faz o trabalho a cada ~0,6 s). */
export function updateSparring(w: World): void {
  if (w.now < (nextCheck.get(w) ?? 0)) return;
  nextCheck.set(w, w.now + 600);
  const training = new Set<string>();
  for (const p of allParties(w)) if (p.friendlyFire && p.sparMode !== 'duel') for (const id of p.members) training.add(id);
  for (const id of [...w.social.sparGear.keys()]) if (!training.has(id)) restore(w, id);
  for (const id of training) {
    const a = actorById(w, id);
    if (a && !a.dead) equipWeakest(w, a);
  }
}
