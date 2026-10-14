// Camadas informativas do HUD: mensagens, banner de região, subida de nível, tela de morte e FPS.
import { useEffect, useState } from 'react';
import { useLocal, useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import type { ChatMessage } from '../../integration/game-ui-bridge/store';
import { PixelButton } from '../common/primitives';

const KIND_COLOR: Record<ChatMessage['kind'], string> = {
  info: '#e2dce6',
  warning: '#ffb08a',
  loot: '#f8dc6c',
  combat: '#c9e4a8',
  system: '#9dd8f2',
  levelup: '#fff09a',
};

export function MessageLog({ max = 4 }: { max?: number }) {
  const messages = useLocal((s) => s.messages.slice(-max));
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = performance.now();
  return (
    <div className="pointer-events-none flex flex-col gap-[2px]" aria-live="polite" data-testid="message-log">
      {messages.map((m) => {
        const age = now - m.at;
        const opacity = age > 7000 ? 0 : age > 5000 ? 1 - (age - 5000) / 2000 : 1;
        if (opacity <= 0) return null;
        return (
          <div key={m.id} className="text-outline w-fit max-w-[78vw] rounded-sm bg-[#120d18]/45 px-1 text-[12px] leading-snug lg:max-w-[440px] lg:text-[13px]" style={{ color: KIND_COLOR[m.kind], opacity }}>
            {m.text}
          </div>
        );
      })}
    </div>
  );
}

export function RegionBanner() {
  const banner = useLocal((s) => s.banner);
  if (!banner) return null;
  return (
    <div key={banner.id} className="anim-rise-fade pointer-events-none absolute left-0 right-0 top-[22%] z-30 flex flex-col items-center text-center">
      <div className="text-outline text-2xl text-gold-light lg:text-3xl">{banner.title}</div>
      {banner.subtitle && <div className="text-outline mt-1 text-[12px] text-parchment">{banner.subtitle}</div>}
    </div>
  );
}

export function LevelUpToast() {
  const lu = useLocal((s) => s.levelUp);
  if (!lu) return null;
  return (
    <div key={lu.id} className="anim-rise-fade pointer-events-none absolute left-0 right-0 top-[34%] z-30 flex flex-col items-center">
      <div className="text-outline text-3xl text-gold-light">Nível {lu.level}!</div>
      <div className="text-outline text-[12px] text-parchment">Vida e mana máximas aumentaram</div>
    </div>
  );
}

export function DeathOverlay() {
  const dead = useSnap((s) => s.player.dead);
  const session = useSession();
  if (!dead) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#3a0a12]/70">
      <div className="frame-dark anim-pop flex w-[300px] flex-col items-center gap-3 text-center">
        <div className="text-2xl text-hp-light">Você morreu</div>
        <p className="text-[13px] leading-snug text-muted">Você perdeu parte da experiência deste nível. Seus itens estão seguros.</p>
        <PixelButton variant="gold" className="w-full py-1 text-base" onClick={() => session.respawn()}>
          Renascer no templo
        </PixelButton>
      </div>
    </div>
  );
}

export function FpsCounter() {
  const fps = useLocal((s) => s.fps);
  return <div className="text-outline pointer-events-none fixed right-2 top-[calc(env(safe-area-inset-top)+64px)] z-30 text-[10px] text-muted">{fps} FPS</div>;
}
