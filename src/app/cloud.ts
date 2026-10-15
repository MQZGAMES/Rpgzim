// Conta na nuvem (GitHub do próprio jogador): guarda a conexão neste navegador e liga/desliga a
// sincronização do repositório de saves. O token fica SOMENTE no localStorage deste navegador.
import { connectGitHubAccount, remoteRepositoryFor, type GitHubAccount } from '../game/persistence/github/account';
import type { SyncedSaveRepository, SyncStatus } from '../game/persistence/SyncedSaveRepository';
import type { SaveFile } from '../game/persistence/saveSchema';

const KEY = 'rpgzim:github';

function readStored(): GitHubAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<GitHubAccount>;
    return a.token && a.login && a.repo ? { token: a.token, login: a.login, repo: a.repo, avatarUrl: a.avatarUrl ?? '' } : null;
  } catch {
    return null;
  }
}

export interface CloudState {
  account: Omit<GitHubAccount, 'token'> | null;
  status: SyncStatus;
}

export class CloudAccount {
  private account: GitHubAccount | null = null;
  private listeners = new Set<() => void>();
  private state: CloudState;

  constructor(private readonly repo: SyncedSaveRepository<SaveFile>) {
    this.state = { account: null, status: repo.getStatus() };
    repo.subscribe(() => this.emit());
    const stored = readStored();
    if (stored) this.use(stored);
  }

  private use(a: GitHubAccount | null): void {
    this.account = a;
    this.repo.setRemote(a ? remoteRepositoryFor<SaveFile>(a) : null);
    this.emit();
  }

  private emit(): void {
    const a = this.account;
    this.state = { account: a ? { login: a.login, repo: a.repo, avatarUrl: a.avatarUrl } : null, status: this.repo.getStatus() };
    for (const l of this.listeners) l();
  }

  get = (): CloudState => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Valida o token e o repositório, salva a conexão e faz a primeira sincronização completa. */
  async connect(token: string, repoName: string): Promise<void> {
    const a = await connectGitHubAccount(token, repoName);
    try {
      localStorage.setItem(KEY, JSON.stringify(a));
    } catch {
      /* navegador sem armazenamento: conecta só nesta sessão */
    }
    this.use(a);
    await this.repo.syncAll().catch(() => undefined);
  }

  async syncNow(): Promise<void> {
    await this.repo.flushRemote();
    await this.repo.syncAll();
  }

  /** Desconecta e apaga o token deste navegador (os saves locais e os da nuvem continuam). */
  disconnect(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignora */
    }
    this.use(null);
  }
}
