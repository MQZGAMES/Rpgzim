// Bloqueia o zoom do navegador no celular (pinça, toque duplo e gestos do Safari/iOS), que o
// meta viewport sozinho não impede no iOS. Campos de texto continuam funcionando normalmente.
export function installZoomGuard(): void {
  const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

  // Safari/iOS: gestos de pinça
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  // pinça com dois ou mais dedos
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  // toque duplo rápido
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd < 350 && !isEditable(e.target)) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  // Ctrl + roda do mouse / trackpad no desktop
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  resetViewportZoom();
  window.addEventListener('orientationchange', resetViewportZoom);
}

/** Reaplica o meta viewport, o que faz o navegador voltar para a escala 1 se já estiver ampliado. */
export function resetViewportZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  if (!meta) return;
  const content = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover';
  meta.setAttribute('content', content + ', x=1');
  requestAnimationFrame(() => meta.setAttribute('content', content));
}
