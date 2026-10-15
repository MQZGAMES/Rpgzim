// Login com GitHub (token pessoal do jogador + repositório privado de saves) e estado da sincronização.
import { useState, useSyncExternalStore } from 'react';
import { DEFAULT_SAVE_REPO } from '../../game/persistence/github/account';
import { Panel, PixelButton } from '../../ui/common/primitives';
import { useServices } from '../providers/services';
import type { CloudState } from '../cloud';

export function useCloud(): CloudState {
  const { cloud } = useServices();
  return useSyncExternalStore(cloud.subscribe, cloud.get);
}

const NEW_REPO_URL = `https://github.com/new?name=${DEFAULT_SAVE_REPO}&visibility=private&description=${encodeURIComponent('Saves do Rpgzim')}`;
const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

function timeAgo(t: number | null): string {
  if (!t) return 'ainda não sincronizado';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'agora há pouco' : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`;
}

/** Linha compacta para a tela inicial: abre o painel. */
export function CloudBadge({ onOpen }: { onOpen: () => void }) {
  const { account, status } = useCloud();
  const color = status.state === 'error' ? 'text-hp-light' : status.state === 'syncing' ? 'text-gold-light' : 'text-heal';
  return (
    <button type="button" onClick={onOpen} className="btn-pixel mt-3 flex w-full items-center justify-center gap-2 py-1 text-[13px]" data-testid="cloud-badge">
      {account ? (
        <>
          {account.avatarUrl && <img src={account.avatarUrl} alt="" className="h-5 w-5 rounded-full" />}
          <span>@{account.login}</span>
          <span className={`text-[11px] ${color}`}>{status.state === 'error' ? 'erro na sincronização' : status.state === 'syncing' ? 'sincronizando…' : 'sincronizado'}</span>
        </>
      ) : (
        <span>Entrar com GitHub (sincronizar a conta)</span>
      )}
    </button>
  );
}

export function CloudPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { cloud } = useServices();
  const { account, status } = useCloud();
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState(DEFAULT_SAVE_REPO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Conta GitHub" onClose={onClose} icon="ui_save">
      <div className="space-y-3 text-[13px] leading-snug" data-testid="cloud-panel">
        {account ? (
          <>
            <div className="frame-slot flex items-center gap-3 !border-[6px] p-2">
              {account.avatarUrl && <img src={account.avatarUrl} alt="" className="h-10 w-10 rounded-full" />}
              <div className="min-w-0 flex-1">
                <div className="text-gold-light">@{account.login}</div>
                <a className="block truncate text-[12px] text-mana-light underline" href={`https://github.com/${account.repo}`} target="_blank" rel="noreferrer">
                  {account.repo} (privado)
                </a>
              </div>
            </div>
            <p className={status.state === 'error' ? 'text-hp-light' : 'text-parchment'} data-testid="cloud-status">
              {status.message} <span className="text-muted">· {timeAgo(status.lastSyncAt)}</span>
            </p>
            <p className="text-[12px] text-muted">
              O jogo salva primeiro neste navegador e envia para o GitHub em seguida (a cada 1 minuto durante o jogo, só se algo
              mudou, e sempre ao sair ou trocar de app). Em outro aparelho, entre com um token do mesmo repositório para continuar de onde parou.
            </p>
            <div className="flex flex-wrap gap-2">
              <PixelButton variant="gold" disabled={busy} onClick={() => void run(() => cloud.syncNow())}>
                {busy ? 'Sincronizando…' : 'Sincronizar agora'}
              </PixelButton>
              <PixelButton
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Desconectar e apagar o token deste navegador? Seus saves continuam aqui e no GitHub.')) {
                    cloud.disconnect();
                    onChanged();
                  }
                }}
              >
                Desconectar
              </PixelButton>
            </div>
          </>
        ) : (
          <>
            <p>
              Guarde seus personagens num <b>repositório privado da sua conta do GitHub</b> e continue em qualquer aparelho. Sem
              servidor do jogo no meio: o navegador fala direto com o GitHub.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Crie um repositório <b>privado</b> chamado <code className="text-gold-light">{DEFAULT_SAVE_REPO}</code>.{' '}
                <a className="text-mana-light underline" href={NEW_REPO_URL} target="_blank" rel="noreferrer">
                  Criar repositório ↗
                </a>
              </li>
              <li>
                Gere um token <b>fine-grained</b>{' '}
                <a className="text-mana-light underline" href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
                  Gerar token ↗
                </a>
                <br />
                <span className="text-[12px] text-muted">
                  Repository access: <b>Only select repositories</b> → {DEFAULT_SAVE_REPO}. Permissions → Repository → <b>Contents: Read and write</b>. Escolha a validade.
                </span>
              </li>
              <li>Cole o token abaixo e conecte.</li>
            </ol>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await cloud.connect(token, repo);
                  setToken('');
                });
              }}
            >
              <label className="block">
                <span className="text-[12px] text-muted">Token do GitHub</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_…"
                  className="mt-1 h-10 w-full border-2 border-ink bg-[#1a1220] px-2 text-[14px] text-parchment"
                  data-testid="cloud-token"
                />
              </label>
              <label className="block">
                <span className="text-[12px] text-muted">Repositório (nome ou dono/nome)</span>
                <input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  spellCheck={false}
                  className="mt-1 h-10 w-full border-2 border-ink bg-[#1a1220] px-2 text-[14px] text-parchment"
                  data-testid="cloud-repo"
                />
              </label>
              <PixelButton type="submit" variant="gold" className="w-full py-1" disabled={busy || !token.trim()}>
                {busy ? 'Conectando…' : 'Conectar'}
              </PixelButton>
            </form>
            <p className="text-[12px] text-muted">
              🔒 O token fica salvo <b>só neste navegador</b> e só é enviado para api.github.com. Use um token restrito a esse
              repositório. Em computador compartilhado, desconecte ao terminar. Personagens já salvos neste navegador são
              enviados na primeira conexão.
            </p>
          </>
        )}
        {error && (
          <p className="text-hp-light" role="alert" data-testid="cloud-error">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
