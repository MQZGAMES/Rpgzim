// Cliente mínimo da API REST do GitHub (api.github.com aceita CORS com token), usado para guardar os saves
// num repositório PRIVADO do próprio jogador. O token nunca sai do navegador do jogador, exceto para a API.
export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export interface GitHubRepoInfo {
  fullName: string;
  private: boolean;
  canPush: boolean;
}

export interface GitHubFile {
  text: string;
  sha: string;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

/** Base64 de texto UTF-8 (nomes com acento) — btoa sozinho só aceita Latin-1. */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class GitHubClient {
  private readonly api = 'https://api.github.com';

  constructor(
    private readonly token: string,
    private readonly fetchFn: Fetch = (...a) => fetch(...a),
  ) {}

  private async request<T>(method: string, path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
    const res = await this.fetchFn(this.api + path, {
      method,
      // as respostas da API têm cache de 60 s; sem isto uma leitura logo após gravar viria desatualizada
      cache: 'no-store',
      keepalive: opts.keepalive,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `GitHub respondeu ${res.status}`;
      try {
        const j = (await res.json()) as { message?: string };
        if (j.message) msg += `: ${j.message}`;
      } catch {
        /* corpo vazio */
      }
      throw new GitHubError(res.status, msg);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async user(): Promise<GitHubUser> {
    const u = await this.request<{ login: string; avatar_url: string }>('GET', '/user');
    return { login: u.login, avatarUrl: u.avatar_url };
  }

  async repo(owner: string, repo: string): Promise<GitHubRepoInfo | null> {
    try {
      const r = await this.request<{ full_name: string; private: boolean; permissions?: { push?: boolean } }>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
      return { fullName: r.full_name, private: r.private, canPush: r.permissions?.push ?? false };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  /** Cria um repositório privado na conta do usuário (exige token com permissão de criar repositórios). */
  async createPrivateRepo(name: string): Promise<GitHubRepoInfo> {
    const r = await this.request<{ full_name: string; private: boolean }>('POST', '/user/repos', {
      name,
      private: true,
      auto_init: true,
      description: 'Saves do Rpgzim — Crônicas de Pedraluz (sincronização da conta)',
    });
    return { fullName: r.full_name, private: r.private, canPush: true };
  }

  async getFile(fullName: string, path: string): Promise<GitHubFile | null> {
    try {
      const f = await this.request<{ content?: string; sha: string; type: string }>('GET', `/repos/${fullName}/contents/${encodePath(path)}`);
      if (f.type !== 'file') return null;
      return { text: base64ToUtf8(f.content ?? ''), sha: f.sha };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  /** Lista os arquivos de uma pasta (vazia se a pasta não existir). */
  async listDir(fullName: string, path: string): Promise<{ name: string; path: string; sha: string }[]> {
    try {
      const items = await this.request<{ name: string; path: string; sha: string; type: string }[]>('GET', `/repos/${fullName}/contents/${encodePath(path)}`);
      return Array.isArray(items) ? items.filter((i) => i.type === 'file') : [];
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return [];
      throw e;
    }
  }

  /** Cria ou atualiza um arquivo; `sha` é obrigatório para atualizar (controle de concorrência do GitHub). */
  async putFile(fullName: string, path: string, text: string, sha: string | undefined, message: string, keepalive = false): Promise<string> {
    const r = await this.request<{ content: { sha: string } }>('PUT', `/repos/${fullName}/contents/${encodePath(path)}`, { message, content: utf8ToBase64(text), ...(sha ? { sha } : {}) }, { keepalive });
    return r.content.sha;
  }

  async deleteFile(fullName: string, path: string, sha: string, message: string): Promise<void> {
    await this.request('DELETE', `/repos/${fullName}/contents/${encodePath(path)}`, { message, sha });
  }
}
