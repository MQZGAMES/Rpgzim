// Célula de item (mochila, depósito): ícone, quantidade, ataque/defesa e destaque verde quando o item
// é melhor que o equipado. O toque duplo é detectado por pointerup, porque o bloqueio de zoom do
// celular cancela o segundo "click" de um toque duplo.
import { useRef } from 'react';
import type { ItemView } from '../../integration/game-ui-bridge/snapshot';
import { ItemIcon } from '../common/primitives';

const DOUBLE_TAP_MS = 400;

/** Números de ataque e defesa do item; verdes quando ele é melhor que o equipado. */
export function ItemStats({ item, size = 'sm' }: { item: ItemView; size?: 'sm' | 'md' }) {
  if (item.atk === null && item.def === null) return null;
  const color = item.better ? 'text-heal' : 'text-parchment';
  const icon = size === 'sm' ? 9 : 12;
  const text = size === 'sm' ? 'text-[9px]' : 'text-[11px]';
  return (
    <span className={`text-outline inline-flex items-center gap-[3px] leading-none ${color} ${text}`} data-testid="item-stats">
      {item.atk !== null && (
        <span className="inline-flex items-center gap-[1px]" title="Ataque">
          <ItemIcon icon="ui_attack" size={icon} />
          {item.atk}
        </span>
      )}
      {item.def !== null && (
        <span className="inline-flex items-center gap-[1px]" title="Defesa">
          <ItemIcon icon="ui_shield" size={icon} />
          {item.def}
        </span>
      )}
    </span>
  );
}

export function ItemCell({
  item,
  active,
  onTap,
  onDoubleTap,
  testId,
  emptyLabel = 'Espaço vazio',
  iconSize = 32,
}: {
  item: ItemView | null;
  active?: boolean;
  onTap: () => void;
  onDoubleTap?: () => void;
  testId?: string;
  emptyLabel?: string;
  iconSize?: number;
}) {
  const lastUp = useRef(0);
  return (
    <button
      type="button"
      onPointerUp={(e) => {
        if (e.button !== 0) return;
        const now = performance.now();
        if (onDoubleTap && item && now - lastUp.current < DOUBLE_TAP_MS) {
          lastUp.current = 0;
          onDoubleTap();
        } else {
          lastUp.current = now;
          onTap();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      className={`frame-slot relative flex aspect-square items-center justify-center !border-[5px] ${active ? 'outline-2 outline-gold-light' : ''} ${item?.better ? 'shadow-[inset_0_0_0_2px_rgba(79,208,138,0.55)]' : ''}`}
      aria-label={item ? `${item.name}${item.count > 1 ? ` x${item.count}` : ''}${item.better ? ' (melhor que o equipado)' : ''}` : emptyLabel}
      data-testid={testId}
      data-better={item?.better ? 'true' : undefined}
    >
      {item && <ItemIcon icon={item.icon} size={iconSize} className={item.blockedReason ? 'opacity-60' : ''} />}
      {item && item.count > 1 && <span className="text-outline absolute bottom-[-4px] right-[-2px] text-[10px]">{item.count}</span>}
      {item && (item.atk !== null || item.def !== null) && (
        <span className="pointer-events-none absolute left-[-3px] top-[-4px]">
          <ItemStats item={item} />
        </span>
      )}
      {item?.better && <span className="text-outline pointer-events-none absolute bottom-[-5px] left-[-3px] text-[10px] leading-none text-heal">▲</span>}
    </button>
  );
}
