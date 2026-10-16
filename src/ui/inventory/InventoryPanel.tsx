// Mochila + equipamentos com detalhes do item, comparação com o equipado e ações (usar/equipar/descartar).
import { useEffect, useState } from 'react';
import { EQUIP_SLOTS, type EquipSlot } from '../../domain/entities/definitions';
import { GAME_DATA } from '../../data';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import type { ItemView } from '../../integration/game-ui-bridge/snapshot';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { ItemCell, ItemStats } from './ItemCell';

type Selection = { from: 'bag'; index: number } | { from: 'slot'; slot: EquipSlot } | null;

const SLOT_ICON: Record<EquipSlot, string> = {
  head: 'item_helmet_leather',
  amulet: 'item_amulet_mana',
  body: 'item_armor_leather',
  mainHand: 'item_sword_short',
  offHand: 'item_shield_wood',
  legs: 'item_legs_leather',
  ring: 'item_ring_vigor',
  feet: 'item_boots_leather',
  ammo: 'item_arrow',
};

function statMap(itemId: string | null | undefined): Record<string, number> {
  if (!itemId) return {};
  const d = GAME_DATA.items[itemId];
  if (!d) return {};
  const m: Record<string, number> = {};
  if (d.weapon && d.weapon.kind !== 'wand') m['Ataque'] = d.weapon.attack;
  if (d.weapon?.damage) m['Dano médio'] = (d.weapon.damage[0] + d.weapon.damage[1]) / 2;
  if (d.weapon) m['Alcance'] = d.weapon.range;
  if (d.armor) m['Armadura'] = d.armor;
  if (d.defense) m['Defesa'] = d.defense;
  if (d.bonuses?.maxHealth) m['Vida máx.'] = d.bonuses.maxHealth;
  if (d.bonuses?.maxMana) m['Mana máx.'] = d.bonuses.maxMana;
  if (d.bonuses?.speed) m['Velocidade'] = d.bonuses.speed;
  return m;
}

function Comparison({ item, equipped }: { item: ItemView; equipped: ItemView | null }) {
  const a = statMap(item.itemId);
  const b = statMap(equipped?.itemId);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (!keys.length) return null;
  return (
    <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 text-[12px]">
      <div className="col-span-2 mb-1 text-[11px] text-muted">Comparado ao equipado{equipped ? ` (${equipped.name})` : ' (vazio)'}:</div>
      {keys.map((k) => {
        const diff = Math.round(((a[k] ?? 0) - (b[k] ?? 0)) * 10) / 10;
        return (
          <div key={k} className="contents">
            <span>{k}</span>
            <span className={diff > 0 ? 'text-heal' : diff < 0 ? 'text-hp-light' : 'text-muted'}>{diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ItemDetails({ item, equipped, actions }: { item: ItemView; equipped?: ItemView | null; actions?: React.ReactNode }) {
  return (
    <div className="frame-tooltip anim-pop text-[13px]" data-testid="item-details">
      <div className="flex items-start gap-3">
        <div className="frame-slot !border-[6px]">
          <ItemIcon icon={item.icon} size={40} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-gold-light">
            {item.name}
            {item.count > 1 ? ` x${item.count}` : ''}
          </div>
          <ItemStats item={item} size="md" />
          {item.better && <div className="text-[11px] text-heal">Melhor que o equipado</div>}
          <div className="text-[12px] leading-snug text-muted">{item.description}</div>
        </div>
      </div>
      {item.lines.length > 0 && (
        <ul className="mt-2 space-y-[1px] text-[12px] text-parchment">
          {item.lines.map((l) => (
            <li key={l}>• {l}</li>
          ))}
        </ul>
      )}
      {item.blockedReason && <div className="mt-1 text-[12px] text-hp-light">{item.blockedReason}</div>}
      {item.slot && equipped !== undefined && <Comparison item={item} equipped={equipped} />}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Trava/destrava a venda do item (o cadeado o deixa fora do "Vender tudo"). */
function LockButton({ item }: { item: ItemView }) {
  const session = useSession();
  if (item.value <= 0) return null;
  return (
    <PixelButton onClick={() => session.setSellLock(item.itemId, !item.locked)} title={item.locked ? 'Volta a entrar no "Vender tudo"' : 'Não entra no "Vender tudo" das lojas'}>
      <span className="inline-flex items-center gap-1">
        <ItemIcon icon="ui_lock" size={14} className={item.locked ? '' : 'opacity-60 grayscale'} />
        {item.locked ? 'Destravar venda' : 'Travar venda'}
      </span>
    </PixelButton>
  );
}

export function InventoryPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const inv = useSnap((s) => s.inventory);
  const eq = useSnap((s) => s.equipment);
  const labels = useSnap((s) => s.slotLabels);
  const gold = useSnap((s) => s.player.gold);
  const stats = useSnap((s) => s.stats);
  const [sel, setSel] = useState<Selection>(null);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 1800);
    return () => clearTimeout(t);
  }, [notice]);
  const quickUse = (i: number) => {
    const it = inv[i];
    if (!it) return;
    if (it.equipable) {
      if (session.equip(i)) {
        setNotice({ id: Date.now(), text: `${it.name} equipado!` });
        setSel(null);
      }
    } else if (it.usable) session.useItem(i);
  };
  const selected = sel?.from === 'bag' ? inv[sel.index] : sel?.from === 'slot' ? eq[sel.slot] : null;
  const equippedSame = selected?.slot ? eq[selected.slot] : null;

  const Slot = ({ slot }: { slot: EquipSlot }) => {
    const it = eq[slot];
    const active = sel?.from === 'slot' && sel.slot === slot;
    return (
      <button
        type="button"
        onClick={() => setSel(it ? { from: 'slot', slot } : null)}
        className={`frame-slot relative flex h-[54px] w-[54px] items-center justify-center !border-[6px] ${active ? 'outline-2 outline-gold-light' : ''}`}
        title={labels[slot]}
        aria-label={`${labels[slot]}: ${it?.name ?? 'vazio'}`}
        data-testid={`slot-${slot}`}
      >
        {it ? <ItemIcon icon={it.icon} size={36} /> : <ItemIcon icon={SLOT_ICON[slot]} size={30} className="opacity-20 grayscale" />}
        {it && it.count > 1 && <span className="text-outline absolute bottom-[-4px] right-[-2px] text-[10px]">{it.count}</span>}
        {it && (
          <span className="pointer-events-none absolute left-[-3px] top-[-4px]">
            <ItemStats item={it} />
          </span>
        )}
      </button>
    );
  };

  return (
    <Panel title="Mochila e equipamento" onClose={onClose} icon="ui_bag" wide>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="shrink-0">
          <div className="grid grid-cols-3 justify-items-center gap-1">
            <div />
            <Slot slot="head" />
            <Slot slot="amulet" />
            <Slot slot="mainHand" />
            <Slot slot="body" />
            <Slot slot="offHand" />
            <Slot slot="ring" />
            <Slot slot="legs" />
            <Slot slot="ammo" />
            <div />
            <Slot slot="feet" />
            <div />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-2 text-[11px] text-muted">
            <span>Arma: {stats.weaponName}</span>
            <span>Ataque: {stats.weaponAttack}</span>
            <span>Armadura: {stats.armor}</span>
            <span>Defesa: {stats.shieldDefense}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="text-muted">
              Mochila {inv.filter(Boolean).length}/{inv.length}
            </span>
            <span className="flex items-center gap-1 text-gold-light">
              <ItemIcon icon="ui_coin" size={14} /> {gold}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {inv.map((it, i) => (
              <ItemCell key={i} item={it} active={sel?.from === 'bag' && sel.index === i} onTap={() => setSel(it ? { from: 'bag', index: i } : null)} onDoubleTap={() => quickUse(i)} testId={`bag-${i}`} />
            ))}
          </div>
        </div>
      </div>
      {notice && (
        <div key={notice.id} className="anim-pop mt-2 text-center text-[13px] text-heal" role="status" data-testid="equip-notice">
          {notice.text}
        </div>
      )}
      {selected && <div className="mt-3" />}
      {selected && (
        <ItemDetails
          item={selected}
          equipped={sel?.from === 'bag' ? equippedSame : undefined}
          actions={
            sel?.from === 'bag' ? (
              <>
                {selected.equipable && (
                  <PixelButton variant="gold" disabled={!selected.canEquipNow} onClick={() => quickUse(sel.index)}>
                    Equipar
                  </PixelButton>
                )}
                {selected.usable && (
                  <PixelButton variant="gold" onClick={() => session.useItem(sel.index)}>
                    Usar
                  </PixelButton>
                )}
                <LockButton item={selected} />
                <PixelButton
                  onClick={() => {
                    if (window.confirm(`Descartar ${selected.name}${selected.count > 1 ? ` x${selected.count}` : ''}?`)) {
                      session.discard(sel.index);
                      setSel(null);
                    }
                  }}
                >
                  Descartar
                </PixelButton>
              </>
            ) : sel?.from === 'slot' ? (
              <>
                <PixelButton
                  onClick={() => {
                    session.unequip(sel.slot);
                    setSel(null);
                  }}
                >
                  Desequipar
                </PixelButton>
                <LockButton item={selected} />
              </>
            ) : null
          }
        />
      )}
      {!selected && <p className="mt-3 text-[12px] text-muted">Toque em um item para ver detalhes e comparar. Toque duplo equipa ou usa direto. Números verdes (▲) indicam um item melhor que o equipado.</p>}
    </Panel>
  );
}

export { EQUIP_SLOTS };
