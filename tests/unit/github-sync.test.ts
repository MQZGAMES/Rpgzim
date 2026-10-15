// Sincronização de saves com o GitHub usando uma API falsa em memória (nenhuma chamada de rede real).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubClient, base64ToUtf8, utf8ToBase64 } from '../../src/game/persistence/github/GitHubClient';
import { GitHubSaveRepository } from '../../src/game/persistence/github/GitHubSaveRepository';
import { connectGitHubAccount } from '../../src/game/persistence/github/account';
import { SyncedSaveRepository } from '../../src/game/persistence/SyncedSaveRepository';
import { MemorySaveRepository } from '../../src/game/persistence/repositories';
import type { SaveSlotSummary } from '../../src/domain/repositories/SaveRepository';

type Data = { savedAt: number; name: string };

/** API REST do GitHub falsa: usuário, repositórios e a API de conteúdo com sha (409 em sha desatualizado). */
function fakeGitHub(opts: { token?: string; repos?: Record<string, { private: boolean; push?: boolean }>; canCreate?: boolean; down?: boolean } = {}) {
  const token = opts.token ?? 'tok';
  const repos = new Map(Object.entries(opts.repos ?? { 'ana/rpgzim-saves': { private: true, push: true } }));
  const files = new Map<string, { content: string; sha: string }>();
  let shaSeq = 0;
  const calls: string[] = [];
  const state = { down: !!opts.down };
  const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (state.down) throw new TypeError('Failed to fetch');
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    const auth = new Headers(init?.headers).get('Authorization');
    if (auth !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
    const p = decodeURIComponent(url.pathname);
    if (p === '/user') return json(200, { login: 'ana', avatar_url: 'https://avatars/ana' });
    if (p === '/user/repos' && method === 'POST') {
      if (!opts.canCreate) return json(403, { message: 'Resource not accessible by personal access token' });
      const body = JSON.parse(String(init?.body)) as { name: string; private: boolean };
      repos.set(`ana/${body.name}`, { private: body.private, push: true });
      return json(201, { full_name: `ana/${body.name}`, private: body.private });
    }
    const m = /^\/repos\/([^/]+\/[^/]+)(?:\/contents\/(.*))?$/.exec(p);
    if (!m) return json(404, { message: 'Not Found' });
    const repo = repos.get(m[1]!);
    if (!repo) return json(404, { message: 'Not Found' });
    if (m[2] === undefined) return json(200, { full_name: m[1], private: repo.private, permissions: { push: repo.push ?? false } });
    const key = `${m[1]}:${m[2]}`;
    if (method === 'GET') {
      const f = files.get(key);
      if (f) return json(200, { type: 'file', content: f.content, sha: f.sha });
      const dir = [...files.entries()].filter(([k]) => k.startsWith(`${key}/`));
      if (dir.length) return json(200, dir.map(([k, v]) => ({ type: 'file', name: k.split('/').pop(), path: k.slice(m[1]!.length + 1), sha: v.sha })));
      return json(404, { message: 'Not Found' });
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { content: string; sha?: string };
      const cur = files.get(key);
      if (cur && body.sha !== cur.sha) return json(409, { message: 'sha does not match' });
      if (!cur && body.sha) return json(422, { message: 'sha wasn\'t supplied' });
      const sha = `s${++shaSeq}`;
      files.set(key, { content: body.content, sha });
      return json(200, { content: { sha } });
    }
    if (method === 'DELETE') {
      files.delete(key);
      return json(200, {});
    }
    return json(405, {});
  }) as typeof fetch;
  return { fetchFn, files, calls, state, repos };
}

const summary = (slotId: string, d: Data): SaveSlotSummary => ({ slotId, name: d.name, vocation: 'knight', level: 1, updatedAt: d.savedAt });

afterEach(() => vi.useRealTimers());

describe('cliente e repositório GitHub', () => {
  it('base64 preserva acentos', () => {
    expect(base64ToUtf8(utf8ToBase64('Pedraluz — João'))).toBe('Pedraluz — João');
  });

  it('salva, lista, carrega, atualiza com sha e apaga', async () => {
    const gh = fakeGitHub();
    const repo = new GitHubSaveRepository<Data>(new GitHubClient('tok', gh.fetchFn), 'ana/rpgzim-saves');
    await repo.save('c1', { savedAt: 1, name: 'Ária' }, summary('c1', { savedAt: 1, name: 'Ária' }));
    await repo.save('c1', { savedAt: 2, name: 'Ária' }, summary('c1', { savedAt: 2, name: 'Ária' }));
    expect((await repo.list()).map((s) => [s.slotId, s.name, s.updatedAt])).toEqual([['c1', 'Ária', 2]]);
    expect(await repo.load('c1')).toEqual({ savedAt: 2, name: 'Ária' });
    await repo.remove('c1');
    expect(await repo.list()).toEqual([]);
  });

  it('outro aparelho gravou antes (sha desatualizado): busca o sha novo e grava', async () => {
    const gh = fakeGitHub();
    const a = new GitHubSaveRepository<Data>(new GitHubClient('tok', gh.fetchFn), 'ana/rpgzim-saves');
    const b = new GitHubSaveRepository<Data>(new GitHubClient('tok', gh.fetchFn), 'ana/rpgzim-saves');
    await a.save('c1', { savedAt: 1, name: 'A' }, summary('c1', { savedAt: 1, name: 'A' }));
    await b.save('c1', { savedAt: 2, name: 'B' }, summary('c1', { savedAt: 2, name: 'B' })); // b não conhecia o sha
    await a.save('c1', { savedAt: 3, name: 'A' }, summary('c1', { savedAt: 3, name: 'A' })); // sha de a ficou velho
    expect(await b.load('c1')).toEqual({ savedAt: 3, name: 'A' });
  });
});

describe('conectar conta', () => {
  it('aceita token válido e repositório privado com escrita', async () => {
    const gh = fakeGitHub();
    const acc = await connectGitHubAccount(' tok ', 'rpgzim-saves', gh.fetchFn);
    expect(acc).toEqual({ token: 'tok', login: 'ana', avatarUrl: 'https://avatars/ana', repo: 'ana/rpgzim-saves' });
  });
  it('recusa token inválido, repositório público, sem escrita ou inexistente', async () => {
    await expect(connectGitHubAccount('errado', 'rpgzim-saves', fakeGitHub().fetchFn)).rejects.toThrow(/Token inválido/);
    await expect(connectGitHubAccount('tok', 'pub', fakeGitHub({ repos: { 'ana/pub': { private: false, push: true } } }).fetchFn)).rejects.toThrow(/público/);
    await expect(connectGitHubAccount('tok', 'ro', fakeGitHub({ repos: { 'ana/ro': { private: true, push: false } } }).fetchFn)).rejects.toThrow(/escrita/);
    await expect(connectGitHubAccount('tok', 'novo', fakeGitHub({ repos: {} }).fetchFn)).rejects.toThrow(/não existe/);
  });
  it('cria o repositório privado quando o token pode', async () => {
    const gh = fakeGitHub({ repos: {}, canCreate: true });
    const acc = await connectGitHubAccount('tok', '', gh.fetchFn);
    expect(acc.repo).toBe('ana/rpgzim-saves');
    expect(gh.repos.get('ana/rpgzim-saves')?.private).toBe(true);
  });
});

describe('sincronização local + nuvem', () => {
  const make = (gh: ReturnType<typeof fakeGitHub>, interval = 15000) => {
    const local = new MemorySaveRepository<Data>();
    const sync = new SyncedSaveRepository<Data>(local, (d) => d.savedAt, (id, d) => summary(id, d), interval);
    sync.setRemote(new GitHubSaveRepository<Data>(new GitHubClient('tok', gh.fetchFn), 'ana/rpgzim-saves'));
    return { local, sync };
  };

  it('grava local na hora e agrupa os envios à nuvem (1 commit por intervalo)', async () => {
    vi.useFakeTimers();
    const gh = fakeGitHub();
    const { local, sync } = make(gh);
    for (let i = 1; i <= 5; i++) await sync.save('c1', { savedAt: i, name: 'A' }, summary('c1', { savedAt: i, name: 'A' }));
    expect((await local.load('c1'))?.savedAt).toBe(5);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20000);
    const puts = gh.calls.filter((c) => c.startsWith('PUT'));
    expect(puts.length).toBeLessThanOrEqual(2);
    vi.useRealTimers();
    await sync.flushRemote();
    const remote = new GitHubSaveRepository<Data>(new GitHubClient('tok', gh.fetchFn), 'ana/rpgzim-saves');
    expect((await remote.load('c1'))?.savedAt).toBe(5);
  });

  it('em outro aparelho: lista e carrega o personagem da nuvem e guarda no navegador', async () => {
    const gh = fakeGitHub();
    const pc = make(gh);
    await pc.sync.save('c1', { savedAt: 10, name: 'Ária' }, summary('c1', { savedAt: 10, name: 'Ária' }));
    await pc.sync.flushRemote();
    const phone = make(gh);
    expect((await phone.sync.list()).map((s) => s.name)).toEqual(['Ária']);
    expect(await phone.sync.load('c1')).toEqual({ savedAt: 10, name: 'Ária' });
    expect(await phone.local.load('c1')).toEqual({ savedAt: 10, name: 'Ária' });
  });

  it('carrega sempre a versão mais nova (nuvem ou navegador)', async () => {
    const gh = fakeGitHub();
    const a = make(gh);
    await a.sync.save('c1', { savedAt: 10, name: 'A' }, summary('c1', { savedAt: 10, name: 'A' }));
    await a.sync.flushRemote();
    const b = make(gh);
    await b.local.save('c1', { savedAt: 5, name: 'velho' }, summary('c1', { savedAt: 5, name: 'velho' }));
    expect((await b.sync.load('c1'))?.savedAt).toBe(10);
    await b.local.save('c1', { savedAt: 20, name: 'offline' }, summary('c1', { savedAt: 20, name: 'offline' }));
    expect((await b.sync.load('c1'))?.name).toBe('offline');
    await b.sync.flushRemote();
    expect((await a.sync.load('c1'))?.name).toBe('offline');
  });

  it('sem internet: continua salvando no navegador e informa o erro; reenvia depois', async () => {
    const gh = fakeGitHub({ down: true });
    const { local, sync } = make(gh, 0);
    await sync.save('c1', { savedAt: 1, name: 'A' }, summary('c1', { savedAt: 1, name: 'A' }));
    await sync.flushRemote();
    expect(sync.getStatus().state).toBe('error');
    expect((await local.load('c1'))?.savedAt).toBe(1);
    gh.state.down = false;
    await sync.flushRemote();
    expect(sync.getStatus().state).toBe('synced');
    expect(gh.files.size).toBe(1);
  });

  it('sincronização completa envia o que só existe no navegador', async () => {
    const gh = fakeGitHub();
    const local = new MemorySaveRepository<Data>();
    await local.save('old', { savedAt: 3, name: 'Antigo' }, summary('old', { savedAt: 3, name: 'Antigo' }));
    const sync = new SyncedSaveRepository<Data>(local, (d) => d.savedAt, (id, d) => summary(id, d));
    sync.setRemote(new GitHubSaveRepository<Data>(new GitHubClient('tok', gh.fetchFn), 'ana/rpgzim-saves'));
    await sync.syncAll();
    expect([...gh.files.keys()]).toEqual(['ana/rpgzim-saves:saves/old.json']);
  });
});
