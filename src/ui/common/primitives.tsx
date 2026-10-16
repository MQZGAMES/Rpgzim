// Componentes visuais reutilizáveis: ícones do atlas, sprites de personagens, barras, botões e painéis.
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ASSETS, SHEETS } from '../../assets';
import { useTap } from './useTap';

export function ItemIcon({
  icon,
  size = 32,
  className = '',
  title,
}: {
  icon: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const f = ASSETS.icons.frames[icon]?.frame;
  if (!f) return <div style={{ width: size, height: size }} className={className} />;
  const scale = size / 16;
  const meta = ASSETS.icons.json.meta.size;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${ASSETS.icons.url})`,
    backgroundPosition: `${-f.x * scale}px ${-f.y * scale}px`,
    backgroundSize: `${meta.w * scale}px ${meta.h * scale}px`,
    imageRendering: 'pixelated',
  };
  return (
    <div role="img" aria-label={title} title={title} style={style} className={`shrink-0 ${className}`} />
  );
}

/** Quadro de uma folha de personagem; com `walk`, anima a caminhada para baixo. */
export function SpriteFrame({
  sheet,
  scale = 3,
  walk = false,
  frame = 0,
  className = '',
}: {
  sheet: string;
  scale?: number;
  walk?: boolean;
  frame?: number;
  className?: string;
}) {
  const info = SHEETS.find((s) => s.key === sheet);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!walk) return;
    const id = setInterval(() => setStep((s) => (s + 1) % 4), 170);
    return () => clearInterval(id);
  }, [walk]);
  if (!info) return null;
  const f = walk ? [1, 0, 2, 0][step]! : frame;
  const col = f % info.columns;
  const row = Math.floor(f / info.columns);
  const rows = Math.ceil(info.frames / info.columns);
  const style: CSSProperties = {
    width: info.frameWidth * scale,
    height: info.frameHeight * scale,
    backgroundImage: `url(${info.url})`,
    backgroundPosition: `${-col * info.frameWidth * scale}px ${-row * info.frameHeight * scale}px`,
    backgroundSize: `${info.columns * info.frameWidth * scale}px ${rows * info.frameHeight * scale}px`,
    imageRendering: 'pixelated',
  };
  return <div style={style} className={`shrink-0 ${className}`} />;
}

export function Bar({
  value,
  max,
  color,
  track = '#2a1d33',
  height = 10,
  label,
  className = '',
}: {
  value: number;
  max: number;
  color: string;
  track?: string;
  height?: number;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className={`relative overflow-hidden border-2 border-ink ${className}`}
      style={{ height: height + 4, background: track }}
    >
      <div
        className="h-full transition-[width] duration-200 ease-out"
        style={{
          width: `${pct * 100}%`,
          background: color,
          boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.28), inset 0 -2px 0 rgba(0,0,0,0.25)',
        }}
      />
      {label !== undefined && (
        <span className="text-outline absolute inset-0 flex items-center justify-center text-[11px] leading-none">
          {label}
        </span>
      )}
    </div>
  );
}

export function PixelButton({
  children,
  onClick,
  variant = 'stone',
  disabled,
  className = '',
  title,
  ariaLabel,
  type = 'button',
  'data-testid': testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'stone' | 'gold';
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit';
  'data-testid'?: string;
}) {
  const tap = useTap(onClick, disabled);
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      {...tap}
      data-testid={testId}
      className={`${variant === 'gold' ? 'btn-gold' : 'btn-pixel'} text-sm leading-tight ${className}`}
    >
      {children}
    </button>
  );
}

/** Painel: no celular vira uma folha inferior; no desktop, uma janela lateral. */
export function Panel({
  title,
  onClose,
  children,
  wide = false,
  variant = 'dark',
  icon,
  scroll = true,
  fill = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  variant?: 'dark' | 'parchment';
  icon?: string;
  scroll?: boolean;
  /** Altura fixa (ocupa o espaço disponível): permite colunas internas com rolagem própria. */
  fill?: boolean;
}) {
  const openedAt = useRef(performance.now());
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/45 lg:items-start lg:justify-end lg:bg-transparent lg:p-4 lg:pt-16"
      // fecha ao tocar fora, mas nunca com o mesmo toque que abriu o painel (click "fantasma")
      onClick={(e) => {
        if (e.target === e.currentTarget && performance.now() - openedAt.current > 400) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`${variant === 'dark' ? 'frame-dark' : 'frame-parchment'} anim-sheet safe-bottom flex w-full flex-col ${
          // a interface é ampliada em monitores grandes (--hud-zoom): a altura compensa para caber na tela
          fill
            ? 'h-[88dvh] max-lg:landscape:h-[94dvh] lg:h-[min(760px,calc((100dvh-5.5rem)/var(--hud-zoom,1)))]'
            : 'max-h-[88dvh] max-lg:landscape:max-h-[94dvh] lg:max-h-[calc((100dvh-5.5rem)/var(--hud-zoom,1))]'
        } ${wide ? 'lg:w-[600px]' : 'lg:w-[440px]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          {icon && <ItemIcon icon={icon} size={24} />}
          <h2
            className={`flex-1 text-lg ${variant === 'dark' ? 'text-gold-light' : 'text-[#5a2e1a]'} text-outline-none`}
          >
            {title}
          </h2>
          <button
            type="button"
            {...useTap(onClose)}
            aria-label="Fechar"
            className="btn-pixel flex h-10 w-10 items-center justify-center"
          >
            <ItemIcon icon="ui_close" size={16} />
          </button>
        </div>
        <div
          className={`min-h-0 flex-1 ${scroll ? 'overflow-y-auto overscroll-contain pr-1' : 'flex flex-col overflow-hidden'}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min ${s % 60}s`;
}

/** Botão com toque confiável (ver `useTap`), para listas e grades onde não dá para chamar o hook diretamente. */
export function TapButton({
  onTap,
  disabled,
  children,
  ...rest
}: { onTap: () => void; disabled?: boolean; children: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'children'
>) {
  const tap = useTap(onTap, disabled);
  return (
    <button type="button" disabled={disabled} {...rest} {...tap}>
      {children}
    </button>
  );
}
