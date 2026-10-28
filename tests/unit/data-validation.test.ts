// Validação dos dados configuráveis: referências cruzadas, ícones existentes e regras do MVP.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { PROPS } from '../../src/data/props';
import icons from '../../src/assets/generated/icons.json';
import objects from '../../src/assets/generated/objects.json';
import fx from '../../src/assets/generated/fx.json';
import manifest from '../../src/assets/generated/manifest.json';
import { VOCATION_IDS } from '../../src/domain/value-objects/ids';

const D = GAME_DATA;
const iconFrames = icons.frames as Record<string, unknown>;
const fxFrames = Object.keys(fx.frames);

describe('itens', () => {
  it('todos têm id estável, nome, descrição e ícone existente', () => {
    for (const [id, item] of Object.entries(D.items)) {
      expect(item.id).toBe(id);
      expect(item.name.length).toBeGreaterThan(2);
      expect(item.description.length).toBeGreaterThan(5);
      expect(iconFrames[item.icon], `ícone de ${id}`).toBeDefined();
      if (item.weapon) expect(item.slot).toBe('mainHand');
      if (item.use) expect(item.slot).toBeUndefined();
      if (item.weapon?.projectile)
        expect(fxFrames.some((f) => f.startsWith(item.weapon!.projectile!))).toBe(true);
    }
  });
});

describe('magias', () => {
  it('há pelo menos 12 magias, cada vocação com 3+ disponíveis', () => {
    expect(Object.keys(D.spells).length).toBeGreaterThanOrEqual(12);
    for (const v of VOCATION_IDS) {
      const voc = D.vocations[v];
      expect(voc.spells.length).toBeGreaterThanOrEqual(3);
      const exclusive = voc.spells.filter((s) => D.spells[s]!.vocations.length === 1);
      expect(exclusive.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('definições completas e coerentes', () => {
    for (const s of Object.values(D.spells)) {
      expect(iconFrames[s.icon], s.id).toBeDefined();
      expect(s.manaCost).toBeGreaterThan(0);
      expect(s.cooldownMs).toBeGreaterThan(0);
      expect(s.words.length).toBeGreaterThan(3);
      if (s.effect === 'conjure') {
        // custo = 4 vezes o que a poção criada recupera
        const use = D.items[s.conjure!.itemId]!.use!;
        expect(s.manaCost, s.id).toBe(4 * (use.heal ?? use.mana ?? 0) * s.conjure!.count);
      } else if (s.effect !== 'buff') expect(s.formula, s.id).toBeDefined();
      if (s.effect === 'buff') expect(s.buff, s.id).toBeDefined();
      if (s.target === 'target' || s.target === 'areaTarget') expect(s.range).toBeGreaterThan(0);
      if (s.target.startsWith('area')) expect(s.radius).toBeGreaterThan(0);
      expect(
        fxFrames.some((f) => f.startsWith(s.vfx.impact)),
        `impacto ${s.vfx.impact}`,
      ).toBe(true);
      for (const v of s.vocations) expect(D.vocations[v].spells).toContain(s.id);
    }
  });
  it('cada vocação tem ataque direto, cura/suporte e ao menos uma magia em área ou buff', () => {
    for (const v of VOCATION_IDS) {
      const list = D.vocations[v].spells.map((id) => D.spells[id]!);
      expect(list.some((s) => s.effect === 'damage' && s.target === 'target')).toBe(true);
      expect(list.some((s) => s.effect === 'heal')).toBe(true);
      expect(list.some((s) => s.target.startsWith('area') || s.effect === 'buff')).toBe(true);
    }
  });
});

describe('vocações', () => {
  it('equipamento inicial é compatível com o slot e com a vocação', () => {
    for (const v of VOCATION_IDS) {
      const voc = D.vocations[v];
      for (const [slot, st] of Object.entries(voc.startingEquipment)) {
        const item = D.items[st!.itemId]!;
        expect(item.slot).toBe(slot);
        if (item.vocations) expect(item.vocations).toContain(v);
      }
      for (const st of voc.startingInventory) expect(D.items[st.itemId]).toBeDefined();
      expect(manifest.sheets[voc.sprite as keyof typeof manifest.sheets]).toBeDefined();
    }
  });
});

describe('monstros, NPCs, lojas e objetos', () => {
  it('monstros têm loot válido e sprite gerado', () => {
    expect(Object.keys(D.monsters).length).toBeGreaterThanOrEqual(3);
    for (const m of Object.values(D.monsters)) {
      expect(manifest.sheets[m.sprite as keyof typeof manifest.sheets]).toBeDefined();
      for (const l of m.loot) {
        expect(D.items[l.itemId]).toBeDefined();
        expect(l.chance).toBeGreaterThan(0);
        expect(l.chance).toBeLessThanOrEqual(1);
        expect(l.max).toBeGreaterThanOrEqual(l.min);
      }
      expect(m.leashRadius).toBeGreaterThan(m.aggroRadius);
    }
  });
  it('NPCs têm diálogo navegável e lojas existentes', () => {
    for (const n of Object.values(D.npcs)) {
      expect(manifest.sheets[n.sprite as keyof typeof manifest.sheets]).toBeDefined();
      const ids = new Set(n.dialog.map((p) => p.id));
      for (const p of n.dialog)
        for (const o of p.options) if (o.action === 'next') expect(ids.has(o.goto!)).toBe(true);
      if (n.shopId) expect(D.shops[n.shopId]).toBeDefined();
    }
  });
  it('lojas referenciam itens existentes e nunca compram mais caro do que vendem', () => {
    for (const s of Object.values(D.shops)) {
      for (const o of [...s.sells, ...s.buys]) expect(D.items[o.itemId], o.itemId).toBeDefined();
      for (const b of s.buys) {
        for (const shop of Object.values(D.shops)) {
          const sale = shop.sells.find((o) => o.itemId === b.itemId);
          if (sale) expect(b.price).toBeLessThan(sale.price);
        }
      }
    }
  });
  it('todos os objetos de cenário apontam para quadros existentes', () => {
    const frames = objects.frames as Record<string, unknown>;
    for (const p of Object.values(PROPS))
      for (const f of p.frames) expect(frames[f], `${p.id}:${f}`).toBeDefined();
  });
});
