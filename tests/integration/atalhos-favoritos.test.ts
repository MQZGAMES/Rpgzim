// Favoritos de atalhos: três conjuntos, o botão (ou a tecla 0) passa para o próximo, a edição vale só para o ativo e
// o save guarda tudo.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { HOTBAR_SIZE } from '../../src/domain/rules/hotbar';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { makeSim } from '../helpers';

describe('favoritos de atalhos', () => {
  it('sem argumento vai para o próximo e dá a volta; a edição fica só no conjunto ativo', () => {
    const sim = makeSim('knight');
    const c = sim.world.player.character;
    const first = c.hotbar[0];
    expect(c.hotbarSet).toBe(0);
    sim.setHotbar(0, { kind: 'potion', id: 'mana' }); // edita o conjunto 1
    expect(sim.setHotbarSet()).toBe(true);
    expect(c.hotbarSet).toBe(1);
    expect(c.hotbar[0]).toBe(first); // o conjunto 2 não herdou a edição
    sim.setHotbar(0, null);
    sim.setHotbarSet();
    sim.setHotbarSet(); // 3 -> volta ao 1
    expect(c.hotbarSet).toBe(0);
    expect(c.hotbar[0]).toBe('potion:mana');
    sim.setHotbarSet(1);
    expect(c.hotbar[0]).toBe('');
    expect(c.hotbar).toHaveLength(HOTBAR_SIZE);
    expect(sim.setHotbarSet(1)).toBe(false); // já é o ativo
    expect(sim.setHotbarSet(7)).toBe(false);
  });

  it('o instantâneo da interface mostra o conjunto ativo e a barra dele', () => {
    const sim = makeSim('knight');
    sim.setHotbar(0, { kind: 'potion', id: 'mana' });
    sim.setHotbarSet(2);
    const snap = buildSnapshot(sim, 0);
    expect(snap.hotbarSet).toBe(2);
    expect(snap.hotbar[0]!.kind).not.toBe('potion');
    sim.setHotbarSet(0);
    expect(buildSnapshot(sim, 0).hotbar[0]!.kind).toBe('potion');
  });

  it('o save grava e devolve os três conjuntos e qual estava ativo', () => {
    const sim = makeSim('knight');
    sim.setHotbar(0, { kind: 'potion', id: 'mana' });
    sim.setHotbarSet(1);
    sim.setHotbar(3, null);
    const back = parseSave(GAME_DATA, JSON.parse(JSON.stringify(toSaveFile(sim.snapshotCharacter())))).character;
    expect(back.hotbarSet).toBe(1);
    expect(back.hotbar[3]).toBe('');
    expect(back.hotbarSets[0]![0]).toBe('potion:mana');
  });
});
