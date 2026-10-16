// Service worker do Rpgzim: deixa o jogo abrir rápido e funcionar sem internet depois da primeira visita.
// - Páginas (navegação): rede primeiro (pega a versão nova logo após publicar), cache se estiver offline.
// - Arquivos estáticos (JS/CSS/imagens/fontes com hash no nome): cache primeiro, atualizando em segundo plano.
// - Chamadas à API do GitHub (sincronização de saves) nunca passam pelo cache.
// o build substitui a versão e a lista abaixo por todos os arquivos publicados (ver vite.config.ts)
const CACHE = 'rpgzim-dev';
const PRECACHE = /*__PRECACHE__*/ [];
const SHELL = ['./', ...PRECACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub API, fontes externas: direto pela rede
  if (req.mode === 'navigate') {
    event.respondWith(
      // no-cache: sempre confere com o servidor (o GitHub Pages guarda a página por até 10 min)
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true }).then((r) => r || caches.match('./', { ignoreVary: true }))),
    );
    return;
  }
  event.respondWith(
    // ignoreVary: scripts de módulo mandam "Origin" e o servidor pode responder com "Vary: Origin"
    caches.match(req, { ignoreVary: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
