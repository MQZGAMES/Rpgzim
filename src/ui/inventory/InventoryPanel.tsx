// Mochila + equipamentos com detalhes do item, comparação com o equipado e ações (usar/equipar/descartar).
import { useEffect, useState } from 'react';
import { type EquipSlot } from '../../domain/entities/definitions';
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

/** Diferença de atributos entre o item e o que está equipado (mesmo slot). */
function Comparison({ item, equipped }: { item: ItemView; equipped: ItemView | null }) {
  const a = statMap(item.itemId);
  const b = statMap(equipped?.itemId);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (!keys.length) return null;
  return (
    <div className="mt-1 border-t border-[#3b2f52] pt-1 text-[11px]" data-testid="item-compare">
      <div className="text-muted">vs. equipado{equipped ? ` (${equipped.name})` : ' (vazio)'}:</div>
      <div className="flex flex-wrap gap-x-2">
        {keys.map((k) => {
          const diff = Math.round(((a[k] ?? 0) - (b[k] ?? 0)) * 10) / 10;
          return (
            <span key={k} className="whitespace-nowrap">
              {k}{' '}
              <b className={diff > 0 ? 'text-heal' : diff < 0 ? 'text-hp-light' : 'text-muted'}>
                {diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff}
              </b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Diferença resumida de ataque/defesa (aparece na grade da mochila, sem abrir o item). */
export function statDiff(item: ItemView, equipped: ItemView | null): string | null {
  // slot vazio: o item inteiro é ganho (ex.: "+8 def"); equipado sem aquele atributo conta como 0
  const parts: string[] = [];
  const atk = (item.atk ?? 0) - (equipped?.atk ?? 0);
  if (item.atk !== null && atk !== 0) parts.push(`${atk > 0 ? '+' : ''}${atk} atq`);
  const def = (item.def ?? 0) - (equipped?.def ?? 0);
  if (item.def !== null && def !== 0) parts.push(`${def > 0 ? '+' : ''}${def} def`);
  return parts.length ? parts.join(' · ') : null;
}

export function ItemDetails({
  item,
  equipped,
  actions,
}: {
  item: ItemView;
  equipped?: ItemView | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="frame-tooltip anim-pop text-[12px]" data-testid="item-details">
      <div className="flex items-start gap-2">
        <div className="frame-slot !border-[5px]">
          <ItemIcon icon={item.icon} size={32} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-gold-light">
            {item.name}
            {item.count > 1 ? ` x${item.count}` : ''}
          </div>
          <ItemStats item={item} size="md" />
          {item.better && <div className="text-[11px] text-heal">Melhor que o equipado</div>}
          <div className="text-[11px] leading-snug text-muted">{item.description}</div>
        </div>
      </div>
      {item.lines.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-parchment">
          {item.lines.map((l) => (
            <span key={l} className="whitespace-nowrap">
              {l}
            </span>
          ))}
        </div>
      )}
      {item.blockedReason && <div className="mt-1 text-[11px] text-hp-light">{item.blockedReason}</div>}
      {item.slot && equipped !== undefined && <Comparison item={item} equipped={equipped} />}
      {actions && <div className="mt-2 flex flex-wrap gap-1">{actions}</div>}
    </div>
  );
}

/** Trava/destrava a venda do item (o cadeado o deixa fora do "Vender tudo"). */
function LockButton({ item }: { item: ItemView }) {
  const session = useSession();
  if (item.value <= 0) return null;
  return (
    <PixelButton
      className="!border-[5px] px-2 text-[12px]"
      onClick={() => session.setSellLock(item.itemId, !item.locked)}
      title={item.locked ? 'Volta a entrar no "Vender tudo"' : 'Não entra no "Vender tudo" das lojas'}
    >
      <span className="inline-flex items-center gap-1">
        <ItemIcon icon="ui_lock" size={14} className={item.locked ? '' : 'opacity-60 grayscale'} />
        {item.locked ? 'Destravar' : 'Travar venda'}
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
        className={`frame-slot relative flex h-[44px] w-[44px] items-center justify-center !border-[5px] max-lg:landscape:h-[40px] max-lg:landscape:w-[40px] lg:h-[50px] lg:w-[50px] ${active ? 'outline-2 outline-gold-light' : ''}`}
        title={labels[slot]}
        aria-label={`${labels[slot]}: ${it?.name ?? 'vazio'}`}
        data-testid={`slot-${slot}`}
      >
        {it ? (
          <ItemIcon icon={it.icon} size={30} />
        ) : (
          <ItemIcon icon={SLOT_ICON[slot]} size={26} className="opacity-20 grayscale" />
        )}
        {it && it.count > 1 && (
          <span className="text-outline absolute bottom-[-4px] right-[-2px] text-[10px]">{it.count}</span>
        )}
        {it && (
          <span className="pointer-events-none absolute left-[-3px] top-[-4px]">
            <ItemStats item={it} />
          </span>
        )}
      </button>
    );
  };

  const details = selected ? (
    <ItemDetails item={selected} equipped={sel?.from === 'bag' ? equippedSame : undefined} />
  ) : (
    <p className="frame-tooltip text-[11px] leading-snug text-muted">
      Toque num item para ver atributos e comparar com o equipado; toque duplo equipa ou usa. Verde (▲) =
      melhor que o equipado.
    </p>
  );
  const actions = selected && (
    <div
      className="frame-slot flex shrink-0 flex-wrap items-center gap-1 !border-[5px] p-1"
      data-testid="bag-actions"
    >
      {sel?.from === 'bag' ? (
        <>
          {selected.equipable && (
            <PixelButton variant="gold" className="!border-[5px] px-2 text-[12px]" disabled={!selected.canEquipNow} onClick={() => quickUse(sel.index)}>
              Equipar
            </PixelButton>
          )}
          {selected.usable && (
            <PixelButton variant="gold" className="!border-[5px] px-2 text-[12px]" onClick={() => session.useItem(sel.index)}>
              Usar
            </PixelButton>
          )}
          <LockButton item={selected} />
          <PixelButton
            className="!border-[5px] px-2 text-[12px]"
            title="Deixa o item no chão embaixo de você (um saco de loot); jogar mais itens no mesmo lugar soma no mesmo saco"
            data-testid="drop-item"
            onClick={() => {
              session.drop(sel.index);
              setSel(null);
            }}
          >
            Jogar no chão
          </PixelButton>
        </>
      ) : sel?.from === 'slot' ? (
        <>
          <PixelButton
            className="!border-[5px] px-2 text-[12px]"
            onClick={() => {
              session.unequip(sel.slot);
              setSel(null);
            }}
          >
            Desequipar
          </PixelButton>
          <LockButton item={selected} />
        </>
      ) : null}
    </div>
  );

  return (
    <Panel title="Mochila e equipamento" onClose={onClose} icon="ui_bag" wide scroll={false} fill>
      {/* Tudo cabe sem rolar: equipamento compacto, mochila em grade pequena e detalhes/ações sempre visíveis.
          Celular em pé e desktop: em coluna. Celular deitado: equipamento | mochila | detalhes. */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 max-lg:landscape:flex-row lg:flex-row"
        data-testid="bag-layout"
      >
        {/* esquerda (desktop): equipamento + mochila; no celular deitado o wrapper some e viram 3 colunas */}
        <div className="flex min-h-0 min-w-0 flex-col gap-1 lg:flex-1 lg:gap-2 max-lg:landscape:contents">
          <div className="flex shrink-0 gap-2 max-lg:landscape:w-[148px] max-lg:landscape:flex-col">
            <div
              className="grid shrink-0 grid-cols-5 gap-1 max-lg:landscape:grid-cols-3"
              data-testid="equip-grid"
            >
              <Slot slot="head" />
              <Slot slot="amulet" />
              <Slot slot="mainHand" />
              <Slot slot="offHand" />
                <Slot slot="body" />
              <Slot slot="ring" />
              <Slot slot="legs" />
              <Slot slot="feet" />
            </div>
            <div className="min-w-0 flex-1 text-[11px] leading-tight text-muted">
              <div className="truncate">Arma: {stats.weaponName}</div>
              <div>Ataque: {stats.weaponAttack}</div>
              <div>Armadura: {stats.armor}</div>
              <div>Defesa: {stats.shieldDefense}</div>
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col max-lg:landscape:flex-1">
            <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
              <span className="text-muted">
                Mochila {inv.filter(Boolean).length}/{inv.length}
              </span>
              <span className="flex items-center gap-1 text-gold-light">
                <ItemIcon icon="ui_coin" size={14} /> {gold}
              </span>
              <PixelButton
                className="!border-[5px] px-1 text-[11px]"
                onClick={() => session.organizeInventory()}
                title="Remove os espaços vazios entre os itens"
                data-testid="bag-organize"
              >
                Organizar
              </PixelButton>
            </div>
            <div
              className="grid content-start justify-center gap-1"
              style={{ gridTemplateColumns: 'repeat(7, minmax(0, 50px))' }}
              data-testid="bag-grid"
            >
              {inv.map((it, i) => (
                <ItemCell
                  key={i}
                  item={it}
                  active={sel?.from === 'bag' && sel.index === i}
                  onTap={() => setSel(it ? { from: 'bag', index: i } : null)}
                  onDoubleTap={() => quickUse(i)}
                  testId={`bag-${i}`}
                  iconSize={28}
                  diff={it?.slot ? statDiff(it, eq[it.slot]) : null}
                />
              ))}
            </div>
          </div>
        </div>
        {/* detalhes (rolam só se o texto for enorme) e ações: sempre à vista */}
        <div className="flex min-h-0 flex-1 flex-col gap-1 max-lg:landscape:w-[236px] max-lg:landscape:flex-none lg:w-[220px] lg:flex-none">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{details}</div>
          {actions}
        </div>
      </div>
      {notice && (
        <div
          key={notice.id}
          className="anim-pop mt-1 text-center text-[12px] text-heal"
          role="status"
          data-testid="equip-notice"
        >
          {notice.text}
        </div>
      )}
    </Panel>
  );
}
