// Service worker do Rpgzim: deixa o jogo abrir rápido e funcionar sem internet depois da primeira visita.
// - Páginas (navegação): rede primeiro (pega a versão nova logo após publicar), cache se estiver offline.
// - Arquivos estáticos (JS/CSS/imagens/fontes com hash no nome): cache primeiro, atualizando em segundo plano.
// - Chamadas à API do GitHub (sincronização de saves) nunca passam pelo cache.
// o build substitui a versão e a lista abaixo por todos os arquivos publicados (ver vite.config.ts)
const CACHE = 'rpgzim-mvuowk0m';
const PRECACHE = ["./apple-touch-icon.png","./assets/char_arch_lich-Sit2iQFp.png","./assets/char_bandit-Be5YsxCQ.png","./assets/char_dark_knight-BjcRrWle.png","./assets/char_death_knight-Cd0S9qZh.png","./assets/char_demon-DSBouFpW.png","./assets/char_druid-Bfiz5fG2.png","./assets/char_goblin-pGs72L9T.png","./assets/char_goblin_chief-s9SoFlVk.png","./assets/char_knight-CYHRHP26.png","./assets/char_lich-CnvOJHha.png","./assets/char_npc_alchemist-Ye88ovHE.png","./assets/char_npc_banker-DVHnx34L.png","./assets/char_npc_farmer-C8Q8YyU-.png","./assets/char_npc_guard-DOyQZGn4.png","./assets/char_npc_merchant-uOXhSS5X.png","./assets/char_npc_priest-DAxPbYjp.png","./assets/char_npc_smith-8h0cwsOf.png","./assets/char_npc_villager-BxpY5PCC.png","./assets/char_ogre-CdGuoe3h.png","./assets/char_orc-VY66zhPD.png","./assets/char_orc_shaman-5lXN3tu7.png","./assets/char_orc_warlord-Dhrgks2s.png","./assets/char_paladin-Do5P83Lv.png","./assets/char_skeleton-CgRa08tp.png","./assets/char_skeleton_knight-CHPW7uPq.png","./assets/char_sorcerer-CzQY6-Zp.png","./assets/char_stone_golem-B3BzZ2Dp.png","./assets/char_troll-DnM0kH5x.png","./assets/char_wraith-z9v4nub7.png","./assets/font-D2wnZyf8.xml","./assets/font-hHfcMZK4.png","./assets/fx-BZNwUCsG.png","./assets/icons-jpbJZj3e.png","./assets/index-B052eyak.js","./assets/index-iyg2d-xT.css","./assets/minimap-BzWHOsIv.png","./assets/mon_bear-CX2ovqu_.png","./assets/mon_behemoth-CCiR3G2W.png","./assets/mon_boar-FecYD4wz.png","./assets/mon_dire_wolf-BKlxIn0B.png","./assets/mon_elder_bear-CJa16lZf.png","./assets/mon_elder_dragon-CRt1JzVk.png","./assets/mon_fire_drake-CGifqAzg.png","./assets/mon_ice_dragon-BAtiNbDC.png","./assets/mon_ice_wolf-_zF28D4x.png","./assets/mon_red_scorpion-DV-qmfaJ.png","./assets/mon_scorpion-D-4mWUwL.png","./assets/mon_slime-rCQnDCmQ.png","./assets/mon_spider-BUYy3o9P.png","./assets/mon_toad-Da1tpj4a.png","./assets/mon_void_horror-CCbU4DL-.png","./assets/mon_wolf-CTKW9VyZ.png","./assets/mon_young_dragon-DCNG_DdN.png","./assets/nunito-cyrillic-ext-wght-normal-D4X5GqEv.woff2","./assets/nunito-cyrillic-wght-normal-CY6AOgYE.woff2","./assets/nunito-latin-ext-wght-normal-CXYtwYOx.woff2","./assets/nunito-latin-wght-normal-BzFMHfZw.woff2","./assets/nunito-vietnamese-wght-normal-U01xdrZh.woff2","./assets/objects-BP0SS4YA.png","./assets/phaser-DXXWZowi.js","./assets/pixelify-sans-cyrillic-700-normal-BrZTw8tu.woff","./assets/pixelify-sans-cyrillic-700-normal-CYtG5Rfp.woff2","./assets/pixelify-sans-latin-700-normal-BctWAS0u.woff","./assets/pixelify-sans-latin-700-normal-D3Xxx3QE.woff2","./assets/pixelify-sans-latin-ext-700-normal-BadXkHzZ.woff","./assets/pixelify-sans-latin-ext-700-normal-ClyJstAh.woff2","./assets/react-DPIr46qh.js","./assets/tiles-Drjzwsgo.png","./assets/ui_button-DXxGoseo.png","./assets/ui_button_gold-BucpPLfS.png","./assets/ui_button_gold_pressed-xRXTJSOC.png","./assets/ui_button_pressed-B8E9w27a.png","./assets/ui_joystick_base-AJpky_Pi.png","./assets/ui_joystick_knob-CLkd5Xgb.png","./assets/ui_panel_dark-D9yMCqhm.png","./assets/ui_panel_parchment-VHn-Hp6D.png","./assets/ui_slot-ucSC62a8.png","./assets/ui_slot_parchment-DvqFBmHF.png","./assets/ui_title_bg-DIVbYa5e.png","./assets/ui_tooltip-DOv0FBZ8.png","./favicon.png","./icon-192.png","./icon-512.png","./icon-maskable-480.png","./index.html","./manifest.webmanifest"];
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
