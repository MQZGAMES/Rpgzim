// Conexão da conta GitHub do jogador: valida o token, encontra (ou cria) o repositório PRIVADO de saves
// e confere a permissão de escrita. Nada aqui é guardado — quem persiste a conta é a camada de app.
import { GitHubClient, GitHubError } from './GitHubClient';
import { GitHubSaveRepository } from './GitHubSaveRepository';

export const DEFAULT_SAVE_REPO = 'rpgzim-saves';

export interface GitHubAccount {
  token: string;
  login: string;
  avatarUrl: string;
  /** "dono/repositorio" */
  repo: string;
}

export class GitHubConnectError extends Error {}

export async function connectGitHubAccount(token: string, repoName: string, fetchFn?: typeof fetch): Promise<GitHubAccount> {
  const t = token.trim();
  if (!t) throw new GitHubConnectError('Cole o token do GitHub.');
  const client = new GitHubClient(t, fetchFn);
  let user;
  try {
    user = await client.user();
  } catch (e) {
    if (e instanceof GitHubError && e.status === 401) throw new GitHubConnectError('Token inválido ou expirado.');
    throw new GitHubConnectError(`Não foi possível falar com o GitHub (${(e as Error).message}).`);
  }
  const name = (repoName.trim() || DEFAULT_SAVE_REPO).replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const [owner, repo] = name.includes('/') ? (name.split('/') as [string, string]) : [user.login, name];
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new GitHubConnectError('Nome de repositório inválido.');
  let info = await client.repo(owner, repo);
  if (!info) {
    if (owner !== user.login) throw new GitHubConnectError(`Repositório ${owner}/${repo} não encontrado ou sem acesso para este token.`);
    try {
      info = await client.createPrivateRepo(repo);
    } catch {
      throw new GitHubConnectError(`O repositório "${repo}" não existe e este token não pode criá-lo. Crie um repositório privado com esse nome e dê acesso a ele no token.`);
    }
  }
  if (!info.private) throw new GitHubConnectError(`O repositório ${info.fullName} é público. Use um repositório PRIVADO para não expor seus saves.`);
  if (!info.canPush) throw new GitHubConnectError('O token não tem permissão de escrita nesse repositório (Contents: Read and write).');
  return { token: t, login: user.login, avatarUrl: user.avatarUrl, repo: info.fullName };
}

export function remoteRepositoryFor<T>(account: GitHubAccount, fetchFn?: typeof fetch): GitHubSaveRepository<T> {
  return new GitHubSaveRepository<T>(new GitHubClient(account.token, fetchFn), account.repo);
}
