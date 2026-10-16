// Aplicativo instalável (PWA): service worker (abre rápido e funciona offline) e suporte à instalação.
// iPhone/iPad não têm botão de instalar automático: a instalação é pelo menu Compartilhar do Safari,
// então a interface mostra o passo a passo. Android/desktop (Chrome/Edge) oferecem o prompt nativo.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function installPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  // só no build publicado (no desenvolvimento o cache atrapalharia as atualizações)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
  }
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Já está aberto como app instalado (tela de início)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad (inclui iPad que se apresenta como Mac). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function canPromptInstall(): boolean {
  return !!deferred;
}

/** Abre o prompt nativo de instalação (Android/desktop). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}
