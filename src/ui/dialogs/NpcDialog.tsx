// Caixa de diálogo estilo RPG clássico (parte inferior da tela) e janela de loot.
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, PixelButton, SpriteFrame } from '../common/primitives';

export function NpcDialog() {
  const session = useSession();
  const d = useSnap((s) => s.dialog);
  if (!d) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom))] lg:bottom-6">
      <div className="frame-parchment anim-sheet pointer-events-auto w-full max-w-[640px]" role="dialog" aria-label={`Conversa com ${d.npcName}`} data-testid="npc-dialog">
        <div className="flex gap-3">
          <div className="frame-slot-light hidden h-[74px] w-[58px] shrink-0 items-end justify-center overflow-hidden !border-[6px] sm:flex">
            <SpriteFrame sheet={d.sprite} scale={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] text-[#5a2e1a]">{d.npcName}</span>
              <span className="text-[11px] text-[#8a6a48]">{d.npcTitle}</span>
            </div>
            <p className="mt-1 text-[14px] leading-snug text-[#3a2b22]">{d.text}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {d.options.map((o, i) => (
            <PixelButton key={o} variant={i === 0 ? 'gold' : 'stone'} className="min-h-10 px-1" onClick={() => session.dialogChoose(i)}>
              {o}
            </PixelButton>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LootWindow() {
  const session = useSession();
  const loot = useSnap((s) => s.loot);
  if (!loot) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(196px,28dvh)] z-40 flex justify-center px-2 lg:bottom-auto lg:top-24">
      <div className="frame-dark anim-pop pointer-events-auto w-full max-w-[340px]" role="dialog" aria-label={loot.title} data-testid="loot-window">
        <div className="mb-2 flex items-center gap-2">
          <ItemIcon icon="ui_bag" size={20} />
          <span className="flex-1 text-[14px] text-gold-light">{loot.title}</span>
          <button type="button" aria-label="Fechar" className="btn-pixel h-9 w-9 !border-[6px]" onClick={() => session.closeLoot()}>
            <ItemIcon icon="ui_close" size={12} className="mx-auto" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {loot.gold > 0 && (
            <button type="button" className="frame-slot relative flex h-[50px] w-[50px] items-center justify-center !border-[5px]" onClick={() => session.takeLoot('gold')} title={`${loot.gold} de ouro`}>
              <ItemIcon icon="item_gold" size={32} />
              <span className="text-outline absolute bottom-[-4px] right-[-2px] text-[10px]">{loot.gold}</span>
            </button>
          )}
          {loot.items.map(({ bagId, index, item: it }) => (
            <button
              type="button"
              key={`${bagId}-${index}-${it.itemId}`}
              className="frame-slot relative flex h-[50px] w-[50px] items-center justify-center !border-[5px]"
              onClick={() => session.takeLoot({ bagId, index })}
              title={`${it.name}${it.count > 1 ? ` x${it.count}` : ''}`}
              aria-label={`Pegar ${it.name}`}
            >
              <ItemIcon icon={it.icon} size={32} />
              {it.count > 1 && <span className="text-outline absolute bottom-[-4px] right-[-2px] text-[10px]">{it.count}</span>}
            </button>
          ))}
        </div>
        <PixelButton variant="gold" className="mt-3 w-full py-1" onClick={() => session.takeLoot('all')}>
          Pegar tudo
        </PixelButton>
        <p className="mt-2 text-center text-[11px] text-muted">Toque num item para pegar só ele. O que ficar continua no chão.</p>
      </div>
    </div>
  );
}
