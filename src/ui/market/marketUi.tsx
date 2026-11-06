// Peças comuns da tela do mercado: moeda, etiqueta de comparação com o equipado, seletores de quantidade e de preço
// (tudo com botões, sem precisar do teclado no celular).
import type { Comparison } from '../../domain/rules/marketCatalog';
import { ItemIcon, PixelButton } from '../common/primitives';

export function Coin({ n, className = 'text-gold-light' }: { n: number | string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2px] whitespace-nowrap ${className}`}>
      <ItemIcon icon="ui_coin" size={11} />
      {n}
    </span>
  );
}

/** Melhor / pior / igual ao que você usa; ou por que não serve (nível, vocação). */
export function FitBadge({
  fit,
  minLevel,
  compact = false,
}: {
  fit: Comparison | undefined;
  minLevel: number;
  compact?: boolean;
}) {
  if (!fit) return null;
  const diffs: string[] = [];
  if (fit.attack) diffs.push(`${fit.attack > 0 ? '+' : ''}${fit.attack} atq`);
  if (fit.defense) diffs.push(`${fit.defense > 0 ? '+' : ''}${fit.defense} def`);
  const d = diffs.length ? ` ${diffs.join(' ')}` : '';
  switch (fit.fit) {
    case 'better':
      return <span className="whitespace-nowrap text-heal">▲ melhor{compact ? '' : d}</span>;
    case 'worse':
      return <span className="whitespace-nowrap text-hp-light">▼ pior{compact ? '' : d}</span>;
    case 'same':
      return <span className="whitespace-nowrap text-muted">= igual</span>;
    case 'usable':
      return <span className="whitespace-nowrap text-heal">✓ pode usar</span>;
    case 'level':
      return <span className="whitespace-nowrap text-gold">requer nv {minLevel}</span>;
    default:
      return <span className="whitespace-nowrap text-muted">não usa</span>;
  }
}

const stepBtn = '!border-[5px] min-h-[34px] min-w-[34px] px-1 text-[12px]';

/** Quantidade: − valor + e "Máx". */
export function QtyStepper({
  value,
  max,
  onChange,
  testId,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  testId?: string;
}) {
  const set = (n: number) => onChange(Math.max(1, Math.min(Math.max(1, max), n)));
  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      <span className="mr-1 text-[11px] text-muted">Qtd.</span>
      <PixelButton
        className={stepBtn}
        onClick={() => set(value - 1)}
        disabled={value <= 1}
        ariaLabel="Menos um"
      >
        −
      </PixelButton>
      <span
        className="min-w-[34px] text-center text-[15px] text-parchment"
        data-testid={testId && `${testId}-value`}
      >
        {value}
      </span>
      <PixelButton
        className={stepBtn}
        onClick={() => set(value + 1)}
        disabled={value >= max}
        ariaLabel="Mais um"
      >
        +
      </PixelButton>
      <PixelButton
        className={stepBtn}
        onClick={() => set(max)}
        disabled={value >= max}
        data-testid={testId && `${testId}-max`}
      >
        Máx {max}
      </PixelButton>
    </div>
  );
}

/** Preço: −10% −1 [valor] +1 +10%, com o valor editável (para quem prefere digitar). */
export function PriceStepper({
  value,
  onChange,
  testId,
}: {
  value: number;
  onChange: (n: number) => void;
  testId?: string;
}) {
  const set = (n: number) => onChange(Math.max(1, Math.round(n)));
  const pct = (k: number) =>
    Math.max(1, Math.round(value * k) === value ? value + (k > 1 ? 1 : -1) : Math.round(value * k));
  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      <PixelButton className={stepBtn} onClick={() => set(pct(0.9))} ariaLabel="Menos 10%">
        −10%
      </PixelButton>
      <PixelButton
        className={stepBtn}
        onClick={() => set(value - 1)}
        disabled={value <= 1}
        ariaLabel="Menos 1"
      >
        −1
      </PixelButton>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, '').slice(0, 9)) || 1)}
        aria-label="Preço por unidade"
        className="h-[34px] w-[72px] min-w-0 border-2 border-ink bg-[#1a1220] px-1 text-center text-[15px] text-gold-light"
        data-testid={testId && `${testId}-value`}
      />
      <PixelButton className={stepBtn} onClick={() => set(value + 1)} ariaLabel="Mais 1">
        +1
      </PixelButton>
      <PixelButton className={stepBtn} onClick={() => set(pct(1.1))} ariaLabel="Mais 10%">
        +10%
      </PixelButton>
    </div>
  );
}

/** Botão de preço sugerido (ex.: "Último negócio 280"). */
export function PriceChip({
  label,
  price,
  active,
  onPick,
  testId,
}: {
  label: string;
  price: number;
  active: boolean;
  onPick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`frame-slot !border-[4px] px-1 py-[3px] text-left text-[11px] leading-tight ${active ? 'outline-2 outline-gold-light' : ''}`}
      data-testid={testId}
    >
      <span className="block text-muted">{label}</span>
      <Coin n={price} />
    </button>
  );
}
