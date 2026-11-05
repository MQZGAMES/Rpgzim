// "Ir até" um personagem online (segue até onde ele estiver, para perto, não ataca) e materiais agrupados no loot.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import type { HeroEntity } from '../../src/game/entities/types';
import { asActor } from '../../src/game/simulation/World';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function withHero() {
  const sim = makeSim('knight', { seed: 15 });
  const w = sim.world;
  const def = D.heroes.maguim!;
  const c = createCharacter(D, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
  const h = sim.addHero(def, c) as HeroEntity;
  h.brain.nextThinkAt = Infinity;
  return { sim, w, h };
}

describe('Ir até', () => {
  it('vai andando até o personagem longe, segue quando ele muda de lugar e para a 2 tiles, sem atacar', () => {
    const { sim, w, h } = withHero();
    for (const m of w.monsters.values()) m.respawnAt = Infinity;
    asActor(w, h, () => sim.teleportPlayer(64, 22)); // na avenida, a leste do templo
    expect(sim.goToActor(h.id)).toBe(true);
    expect(buildSnapshot(sim, 1).goingTo?.name).toBe(h.character.name);
    advance(sim, 4000, 50);
    // ele muda de lugar no meio do caminho: a rota acompanha
    asActor(w, h, () => sim.teleportPlayer(30, 24));
    let t = 0;
    while (sim.goToId && t < 60000) {
      advance(sim, 200, 50);
      t += 200;
    }
    expect(sim.goToId).toBeNull();
    expect(Math.max(Math.abs(w.human.x - h.x), Math.abs(w.human.y - h.y))).toBeLessThanOrEqual(2);
    expect(w.human.targetId).toBeNull();
    // parado ao lado (não fica empurrando)
    const at = { x: w.human.x, y: w.human.y };
    advance(sim, 2000, 50);
    expect({ x: w.human.x, y: w.human.y }).toEqual(at);
  });

  it('atravessa o mapa até quem está longe (Terras Altas)', () => {
    const { sim, w, h } = withHero();
    for (const m of w.monsters.values()) {
      m.alive = false;
      m.respawnAt = Infinity;
    }
    asActor(w, h, () => sim.teleportPlayer(136, 60));
    sim.goToActor(h.id);
    let t = 0;
    while (sim.goToId && t < 150000) {
      advance(sim, 500, 50);
      t += 500;
    }
    expect(Math.max(Math.abs(w.human.x - h.x), Math.abs(w.human.y - h.y))).toBeLessThanOrEqual(2);
  });

  it('andar por conta própria cancela', () => {
    const { sim, w, h } = withHero();
    asActor(w, h, () => sim.teleportPlayer(64, 22));
    sim.goToActor(h.id);
    advance(sim, 500, 50);
    sim.setMoveVector(0, 1);
    advance(sim, 300, 50);
    expect(sim.goToId).toBeNull();
  });
});

describe('materiais agrupados no loot', () => {
  it('o mesmo material em vários sacos ao redor aparece numa pilha só e é pego de uma vez', () => {
    const { sim, w } = withHero();
    const p = w.human;
    sim.teleportPlayer(30, 24);
    for (const [i, n] of [3, 4, 5].entries())
      w.lootBags.set(`b${i}`, { id: `b${i}`, x: p.x + (i - 1), y: p.y + 1, items: [{ itemId: 'wolf_pelt', count: n }, { itemId: 'sword_iron', count: 1 }], gold: 0, expiresAt: Infinity, sourceName: 'Lobo' });
    w.ui.lootId = 'b0';
    const items = buildSnapshot(sim, 1).loot!.items;
    const pelts = items.filter((x) => x.item.itemId === 'wolf_pelt');
    expect(pelts).toHaveLength(1);
    expect(pelts[0]!.item.count).toBe(12);
    expect(items.filter((x) => x.item.itemId === 'sword_iron')).toHaveLength(3); // equipamento: um por um
    sim.takeLoot({ refs: pelts[0]!.refs });
    expect(countItem(p.character.inventory, 'wolf_pelt')).toBe(12);
    expect(p.character.inventory.filter((s) => s?.itemId === 'wolf_pelt')).toHaveLength(1); // numa pilha só
  });
});
