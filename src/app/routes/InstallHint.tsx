// Convite para instalar o jogo na tela de início (iPhone: passo a passo pelo Compartilhar do Safari;
// Android/desktop: botão que abre o prompt nativo). Some quando o jogo já está aberto como app.
import { useState, useSyncExternalStore } from 'react';
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from '../pwa';
import { Panel, PixelButton } from '../../ui/common/primitives';

function ShareIcon() {
  // ícone "Compartilhar" do iOS (quadrado com seta para cima)
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" className="mx-1 inline-block align-[-3px]" aria-label="Compartilhar">
      <path d="M10 2v10M6 6l4-4 4 4" fill="none" stroke="#69a0e0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 9H4.5v8.5h11V9H14" fill="none" stroke="#69a0e0" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function InstallHint() {
  const promptable = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [open, setOpen] = useState(false);
  if (isStandalone()) return null;
  const ios = isIos();
  if (!ios && !promptable) return null;
  return (
    <>
      <PixelButton className="mt-2 w-full py-1 text-[13px]" onClick={() => (ios ? setOpen(true) : void promptInstall())}>
        📲 {ios ? 'Instalar no iPhone (tela de início)' : 'Instalar o app'}
      </PixelButton>
      {open && (
        <Panel title="Instalar no iPhone" onClose={() => setOpen(false)} icon="ui_star">
          <div className="space-y-3 text-[14px] leading-snug" data-testid="install-ios">
            <p>O Rpgzim vira um app na sua tela de início: abre em tela cheia, sem a barra do navegador, e funciona mesmo sem internet depois da primeira vez.</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Abra esta página no <b>Safari</b>.
              </li>
              <li>
                Toque em <b>Compartilhar</b>
                <ShareIcon />
                (na barra de baixo; no iPad, em cima).
              </li>
              <li>
                Role e toque em <b>Adicionar à Tela de Início</b>.
              </li>
              <li>
                Confirme em <b>Adicionar</b>. Pronto: o ícone do cavaleiro aparece na tela de início.
              </li>
            </ol>
            <p className="text-[12px] text-muted">
              Atenção: no iPhone, o app da tela de início guarda os saves separado do Safari. Para continuar no app com um personagem criado no Safari
              (ou em outro aparelho), conecte “Entrar com GitHub” nos dois.
            </p>
          </div>
        </Panel>
      )}
    </>
  );
}
