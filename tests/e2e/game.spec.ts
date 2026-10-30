// Fluxos críticos no navegador: criar personagem, entrar no mundo, mover, lutar, usar magia, coletar loot,
// equipar, negociar, entrar numa casa, salvar e recarregar. A API ?debug é usada apenas para inspecionar o
// estado e posicionar o personagem perto de alvos (encurta o teste); as ações usam a interface real.
import { expect, test, type Page } from '@playwright/test';

type Api = {
  ready(): boolean;
  player(): {
    x: number;
    y: number;
    hp: number;
    mana: number;
    level: number;
    xp: number;
    gold: number;
    target: string | null;
    dead: boolean;
    inventory: { itemId: string; count: number }[];
    equipment: Record<string, { itemId: string; count: number } | undefined>;
  };
  monsters(): { id: string; type: string; x: number; y: number; hp: number; alive: boolean }[];
  npcs(): { id: string; x: number; y: number }[];
  teleport(x: number, y: number): void;
  teleportNear(type: string, dist?: number): string | null;
  loot(): { id: string; x: number; y: number }[];
  ui(): { buildingId: string | null; shop: unknown; dialog: unknown; lootId: string | null };
  walkTo(x: number, y: number): boolean;
  idle(): boolean;
  buildings(): { id: string; x: number; y: number; w: number; h: number; doorX: number }[];
  heroes(): { id: string; x: number; y: number }[];
  screenOf(id: string): { x: number; y: number } | null;
  walkGoal(): { x: number; y: number } | null;
  actorMenu(): string | null;
  stop(): void;
};

const api = <T>(page: Page, fn: (a: Api) => T): Promise<T> =>
  page.evaluate(
    (src) => new Function('a', `return (${src})(a)`)(window.__RPGZIM__),
    fn.toString(),
  ) as Promise<T>;

async function createCharacter(page: Page, vocation: string, name: string) {
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByTestId(`voc-${vocation}`).click();
  await page.getByTestId('name-input').fill(name);
  await page.getByRole('button', { name: 'Começar aventura' }).click();
  await page.waitForFunction(
    () => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true,
    null,
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('status-panel')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // cada teste começa sem saves
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('rpgzim');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
});

test('fluxo principal: mover, lutar, magia, loot, equipar, salvar e recarregar', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'teclado e mouse no desktop');
  await createCharacter(page, 'knight', 'Teste');
  // movimento pelo teclado (8 direções)
  const start = await api(page, (a) => a.player());
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(400);
  const moved = await api(page, (a) => a.player());
  expect(moved.y).toBeGreaterThan(start.y);
  // combate: perto de um slime, seleciona o alvo com Tab e espera o ataque automático vencer
  await api(page, (a) => a.teleport(80, 22));
  const slime = await api(page, (a) => a.teleportNear('slime', 1));
  expect(slime).not.toBeNull();
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => (await api(page, (a) => a.player())).target, { timeout: 5000 })
    .not.toBeNull();
  // o alvo aparece só no mapa (anel + barra vermelha): sem caixa extra cobrindo a tela
  await expect(page.getByTestId('target-frame')).toHaveCount(0);
  // magia pela barra de atalhos (tecla 1 = Golpe Brutal)
  const manaBefore = (await api(page, (a) => a.player())).mana;
  await page.keyboard.press('Digit1');
  await expect
    .poll(async () => (await api(page, (a) => a.player())).mana, { timeout: 3000 })
    .toBeLessThan(manaBefore);
  await expect
    .poll(async () => (await api(page, (a) => a.player())).xp, { timeout: 40_000 })
    .toBeGreaterThan(0);
  // loot: abre pelo botão de ação e coleta tudo
  const bags = await api(page, (a) => a.loot());
  if (bags.length) {
    const gold = (await api(page, (a) => a.player())).gold;
    await page.keyboard.press('KeyE');
    await expect(page.getByTestId('loot-window')).toBeVisible();
    await page.getByRole('button', { name: 'Pegar tudo' }).click();
    await expect.poll(async () => (await api(page, (a) => a.loot())).length).toBe(0);
    const after = await api(page, (a) => a.player());
    expect(after.gold + after.inventory.length).toBeGreaterThan(gold);
  }
  // equipar pela interface: machadinha da mochila
  await page.getByTestId('btn-inventory').click();
  const axeIndex = (await api(page, (a) => a.player())).inventory.findIndex((s) => s.itemId === 'axe_hand');
  await page.getByTestId(`bag-${axeIndex}`).click();
  await expect(page.getByTestId('item-details')).toContainText('Machadinha');
  await page.getByRole('button', { name: 'Equipar' }).click();
  await expect
    .poll(async () => (await api(page, (a) => a.player())).equipment.mainHand?.itemId)
    .toBe('axe_hand');
  await page.keyboard.press('Escape');
  // salvar pelo menu e recarregar
  await page.getByTestId('btn-settings').click();
  await page.getByRole('button', { name: 'Salvar agora' }).click();
  await page.waitForTimeout(500);
  const saved = await api(page, (a) => a.player());
  await page.reload();
  await page.getByText('Teste').first().click();
  await page.waitForFunction(
    () => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true,
  );
  const restored = await api(page, (a) => a.player());
  expect(restored.xp).toBe(saved.xp);
  expect(restored.equipment.mainHand?.itemId).toBe('axe_hand');
  expect(Math.abs(restored.x - saved.x) + Math.abs(restored.y - saved.y)).toBeLessThanOrEqual(2);
});

test('loja: conversar com o ferreiro, comprar e vender', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'fluxo de loja validado no desktop');
  await createCharacter(page, 'paladin', 'Lojista');
  const smith = (await api(page, (a) => a.npcs())).find((n) => n.id === 'npc:smith')!;
  await api(page, (a) => a.teleport(29, 16));
  void smith;
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('npc-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Ver mercadorias' }).click();
  const gold = (await api(page, (a) => a.player())).gold;
  await page.getByTestId('shop-item-club_wood').click();
  await page.getByRole('button', { name: /Comprar por/ }).click();
  await expect.poll(async () => (await api(page, (a) => a.player())).gold).toBe(gold - 25);
  // ouro insuficiente: item caro mostra feedback e não altera o estado
  await page.getByTestId('shop-item-boots_swift').click();
  await page.getByRole('button', { name: /Comprar por/ }).click();
  await expect(page.getByTestId('message-log')).toContainText('Ouro insuficiente');
  await page.getByRole('button', { name: 'Vender' }).click();
  await page.getByTestId('shop-item-club_wood').click();
  await page.getByRole('button', { name: /Vender por/ }).click();
  await expect.poll(async () => (await api(page, (a) => a.player())).gold).toBe(gold - 25 + 9);
});

test('casa explorável no mesmo mapa', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'um projeto basta');
  await createCharacter(page, 'druid', 'Visita');
  const house = (await api(page, (a) => a.buildings())).find((b) => b.id === 'house_rosa')!;
  const doorY = house.y + house.h - 1;
  await api(page, (a) => a.teleport(29, 46));
  await page.evaluate(([x, y]) => (window.__RPGZIM__ as Api).walkTo(x!, y!), [house.doorX, doorY - 2]);
  await expect
    .poll(async () => (await api(page, (a) => a.ui())).buildingId, { timeout: 15_000 })
    .toBe('house_rosa');
  // continua no mesmo canvas/cena: nenhum carregamento de outra tela
  await expect(page.getByTestId('hud')).toBeVisible();
});

test('mobile: joystick move o personagem e o HUD cabe na tela', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'somente emulação mobile');
  await createCharacter(page, 'sorcerer', 'Toque');
  const vp = page.viewportSize()!;
  // nenhum elemento essencial do HUD fora da tela
  for (const id of [
    'status-panel',
    'attack-button',
    'joystick-zone',
    'btn-inventory',
    'btn-settings',
    'potion-health',
  ]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
  }
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noOverflow).toBe(true);
  // arrasta o joystick para a direita (toque)
  await api(page, (a) => a.teleport(30, 23));
  const before = await api(page, (a) => a.player());
  const zone = (await page.getByTestId('joystick-zone').boundingBox())!;
  const ox = zone.x + zone.width * 0.4;
  const oy = zone.y + zone.height * 0.6;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ox, y: oy }] });
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: ox + i * 10, y: oy }],
    });
  await page.waitForTimeout(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await api(page, (a) => a.player());
  expect(after.x).toBeGreaterThan(before.x);
  // botão de ataque seleciona o alvo mais próximo
  await api(page, (a) => a.teleport(80, 22));
  await api(page, (a) => a.teleportNear('slime', 2));
  await page.getByTestId('attack-button').tap();
  await expect.poll(async () => (await api(page, (a) => a.player())).target).not.toBeNull();
  // magia por toque
  const mana = (await api(page, (a) => a.player())).mana;
  await page.getByTestId('spell-arcane_bolt').tap();
  await expect.poll(async () => (await api(page, (a) => a.player())).mana).toBeLessThan(mana);
});

test('banco: guardar item e ouro; botão de loot clicável no desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'um projeto basta');
  await createCharacter(page, 'knight', 'Cofre');
  const banker = (await api(page, (a) => a.npcs())).find((n) => n.id === 'npc:banker')!;
  await page.evaluate(([x, y]) => (window.__RPGZIM__ as Api).teleport(x!, y!), [banker.x, banker.y + 2]);
  await page.getByTestId('interact-button').click();
  await page.getByRole('button', { name: 'Abrir depósito' }).click();
  await expect(page.getByTestId('depot-panel')).toBeVisible();
  await page.getByTestId('depot-amount').fill('25');
  await page.getByRole('button', { name: 'Depositar', exact: true }).click();
  await expect(page.getByTestId('depot-bank-gold')).toContainText('25');
  const axe = (await api(page, (a) => a.player())).inventory.findIndex((s) => s.itemId === 'axe_hand');
  await page.getByTestId(`depot-bag-${axe}`).click();
  await expect(page.getByTestId('depot-slot-0')).toHaveAttribute('aria-label', /Machadinha/);
  await page.locator('[role=dialog] button[aria-label=Fechar]').first().click();
  // loot no chão: o botão contextual abre a janela
  await api(page, (a) => a.teleport(80, 22));
  const id = await api(page, (a) => a.teleportNear('slime', 1));
  await page.evaluate((m) => (window.__RPGZIM__ as Api & { target(id: string): void }).target(m!), id);
  await expect
    .poll(async () => (await api(page, (a) => a.loot())).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await api(page, (a) => a.ui()).then(
    async (ui) => ui.lootId === null && (await page.getByTestId('interact-button').click()),
  );
  await expect(page.getByTestId('loot-window')).toBeVisible();
});

test('mobile: toque duplo equipa; toque curto na área do joystick anda até o ponto', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'somente emulação mobile');
  await createCharacter(page, 'knight', 'Dedos');
  await expect(page.getByTestId('joystick')).toHaveCount(0);
  await api(page, (a) => a.teleport(47, 24));
  const before = await api(page, (a) => a.player());
  const zone = (await page.getByTestId('joystick-zone').boundingBox())!;
  await page.touchscreen.tap(zone.x + zone.width * 0.3, zone.y + zone.height * 0.5);
  await expect
    .poll(async () => {
      const p = await api(page, (a) => a.player());
      return p.x !== before.x || p.y !== before.y;
    })
    .toBe(true);
  await expect(page.getByTestId('joystick')).toHaveCount(0);
  // mochila: machadinha marcada como melhor e equipada com toque duplo
  await page.getByTestId('btn-inventory').tap();
  const axe = (await api(page, (a) => a.player())).inventory.findIndex((s) => s.itemId === 'axe_hand');
  const cell = page.getByTestId(`bag-${axe}`);
  await expect(cell).toHaveAttribute('data-better', 'true');
  // toque duplo: dois "pointerup" de toque em sequência rápida (sem depender da velocidade de renderização da máquina de teste)
  await cell.evaluate((el) => {
    for (let i = 0; i < 2; i++)
      el.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', button: 0, isPrimary: true }),
      );
  });
  await expect(page.getByTestId('equip-notice')).toContainText('Machadinha');
  expect((await api(page, (a) => a.player())).equipment.mainHand?.itemId).toBe('axe_hand');
});

test('Boladex: aparece na tela inicial, vive sozinho no mundo e pode ser jogado', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'um projeto basta');
  await page.goto('/?debug');
  await expect(page.getByTestId('slot-boladex')).toContainText('tem vida própria');
  await createCharacter(page, 'paladin', 'Parceiro');
  type HeroInfo = { id: string; level: number; mode: string; x: number; y: number };
  const heroes = () => page.evaluate(() => (window.__RPGZIM__ as { heroes(): HeroInfo[] }).heroes());
  expect((await heroes()).map((h) => h.id).sort()).toEqual([
    'hero:boladex',
    'hero:distanciado',
    'hero:maguim',
    'hero:mano_cura',
  ]);
  const start = (await heroes()).find((h) => h.id === 'hero:boladex')!;
  // ele sai andando sozinho (decide caçar/passear sem comando do jogador)
  await expect
    .poll(
      async () => {
        const h = (await heroes()).find((x) => x.id === 'hero:boladex')!;
        return h.x !== start.x || h.y !== start.y;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  // jogar como o Boladex: volta ao menu e escolhe o slot dele (sem herói duplicado no mundo)
  await page.goto('/?debug');
  await page.getByTestId('slot-boladex').click();
  await page.waitForFunction(
    () => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true,
    null,
    { timeout: 30_000 },
  );
  expect((await heroes()).map((h) => h.id).sort()).toEqual([
    'hero:distanciado',
    'hero:maguim',
    'hero:mano_cura',
  ]); // sem herói duplicado
  expect((await api(page, (a) => a.player())).inventory.length).toBeGreaterThan(0);
});

test('HUD social: modo de ataque, PK e menu do Boladex com convite para grupo', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'um projeto basta');
  await createCharacter(page, 'knight', 'Social');
  await page.getByTestId('toggle-stand').click();
  await expect(page.getByTestId('toggle-stand')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('toggle-pvp').click();
  await expect(page.getByTestId('toggle-pvp')).toHaveAttribute('aria-pressed', 'true');
  // abre o menu do herói pela simulação do toque (a posição na tela varia com o zoom)
  type HeroInfo = { id: string };
  const id = (await page.evaluate(() => (window.__RPGZIM__ as { heroes(): HeroInfo[] }).heroes()))[0]!.id;
  await page.evaluate(
    (hid) => (window.__RPGZIM__ as { openActorMenu(id: string): void }).openActorMenu(hid),
    id,
  );
  await expect(page.getByTestId('actor-menu')).toContainText('Boladex');
  // menu discreto: sem "Conversar"; atacar só aparece onde é permitido (no templo, área protegida, não)
  await expect(page.getByTestId('actor-menu')).not.toContainText('Conversar');
  await expect(page.getByTestId('actor-attack')).toHaveCount(0);
  // convidar: quando ele aceita, o painel do grupo abre com os controles
  await page.evaluate(() => (window.__RPGZIM__ as { befriendHeroes(): void }).befriendHeroes());
  await page.getByTestId('actor-invite').click();
  await expect(page.getByTestId('party-panel')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('party-formation-line').click();
  await page.getByTestId('party-ff-training').click();
  await page.getByRole('button', { name: 'Fechar' }).first().click();
  await expect(page.getByTestId('party-panel')).toHaveCount(0);
  // o resumo do grupo fica no botão "grupo" do HUD (sem quadro ocupando a tela)
  await page.getByTestId('btn-party').click();
  await expect(page.getByTestId('party-formation-line')).toHaveClass(/btn-gold/);
});

test('mobile: toque no mapa em cima e embaixo, no Boladex (posição real na tela), mini mapa e lista de online', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'somente emulação mobile');
  await createCharacter(page, 'knight', 'Mapa');
  await api(page, (a) => a.teleport(30, 23));
  await page.waitForTimeout(500);
  const vp = page.viewportSize()!;
  // toque na parte de cima e na de baixo do mapa (longe dos botões): o personagem sai andando
  for (const [x, y] of [
    [vp.width * 0.4, vp.height * 0.24],
    [vp.width * 0.3, vp.height * 0.62],
  ] as const) {
    await api(page, (a) => a.stop());
    await page.touchscreen.tap(x, y);
    await expect
      .poll(
        async () => (await api(page, (a) => a.walkGoal())) !== null || !(await api(page, (a) => a.idle())),
      )
      .toBe(true);
    await api(page, (a) => {
      a.stop();
      a.teleport(30, 23);
    });
  }
  // toque no Boladex onde ele aparece na tela: abre o menu dele
  const hero = (await api(page, (a) => a.heroes()))[0]!;
  await page.evaluate(
    (p) => (window.__RPGZIM__ as { teleport(x: number, y: number): void }).teleport(p.x, p.y),
    { x: hero.x, y: hero.y + 3 },
  );
  await page.waitForTimeout(400);
  // ele anda sozinho: lê a posição na tela e toca na hora (repete se ele saiu do lugar entre a leitura e o toque)
  await expect(async () => {
    // fica perto dele a cada tentativa (ele pode ter saído andando para caçar)
    const h = (await api(page, (a) => a.heroes()))[0]!;
    await page.evaluate(
      (p) => (window.__RPGZIM__ as { teleport(x: number, y: number): void }).teleport(p.x, p.y),
      { x: h.x, y: h.y + 2 },
    );
    await page.waitForTimeout(250);
    const pos = await page.evaluate(
      (id) => (window.__RPGZIM__ as { screenOf(id: string): { x: number; y: number } | null }).screenOf(id),
      hero.id,
    );
    expect(pos).not.toBeNull();
    await page.touchscreen.tap(pos!.x, pos!.y);
    await expect(page.getByTestId('actor-menu')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  // mini mapa: toque num lugar distante -> fecha o painel e caminha até lá
  // logo depois de outro toque (o navegador descartaria o "click" como toque duplo): o botão responde mesmo assim
  await page.getByTestId('btn-minimap').tap();
  await expect(page.getByTestId('minimap-panel')).toBeVisible();
  // arrastar o mapa (sem soltar num ponto) só olha em volta: o painel continua aberto e o mapa rolou
  const box = (await page.getByTestId('minimap-panel').boundingBox())!;
  const scrollOf = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid=minimap-image]')!.parentElement!;
      return el.scrollLeft + el.scrollTop;
    });
  const before = await scrollOf();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 - 90, box.y + box.height * 0.5 - 60, { steps: 6 });
  await page.mouse.up();
  expect(await scrollOf()).not.toBe(before);
  await expect(page.getByTestId('minimap-panel')).toBeVisible();
  await page.getByTestId('minimap-zoom').tap();
  const img = (await page.getByTestId('minimap-image').boundingBox())!;
  await page.touchscreen.tap(img.x + img.width * 0.6, img.y + img.height * 0.3);
  await expect(page.getByTestId('minimap-panel')).toHaveCount(0);
  await expect.poll(async () => (await api(page, (a) => a.walkGoal())) !== null).toBe(true);
  // personagens online: chama o Boladex para o grupo
  await page.getByTestId('btn-players').tap();
  await expect(page.getByTestId('players-panel')).toContainText('Boladex');
  await page.getByTestId(`player-invite-${hero.id}`).tap();
  await expect(page.getByTestId(`player-party-${hero.id}`)).toBeVisible();
});

test('mobile: atalho segurado repete e PARA ao soltar; vãos entre atalhos não andam; joystick por cima do HUD; mochila sem rolagem', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'somente emulação mobile');
  await createCharacter(page, 'druid', 'Toque');
  await api(page, (a) => a.teleport(80, 22));
  await page.waitForTimeout(500);
  const fired = () =>
    page.evaluate(() => {
      const a = (window as unknown as { __RPGZIM__: { castLog(): unknown[]; itemLog(): unknown[] } })
        .__RPGZIM__;
      return a.castLog().length + a.itemLog().length;
    });
  const clear = () =>
    page.evaluate(() =>
      (window as unknown as { __RPGZIM__: { clearCastLog(): void } }).__RPGZIM__.clearCastLog(),
    );

  // 1) teclado 3x3 de atalhos + coluna do ataque: nenhum ponto dentro dele (botões e vãos) cai na camada do mapa
  const gaps = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid=touch-grid]')!;
    const b = grid.getBoundingClientRect();
    let onMap = 0;
    let total = 0;
    for (let y = b.top + 1; y < b.bottom - 1; y += 4)
      for (let x = b.left + 1; x < b.right - 1; x += 4) {
        total++;
        if (document.elementFromPoint(x, y)?.closest('[data-testid=map-input]')) onMap++;
      }
    const atk = document.querySelector('[data-testid=attack-button]')!.getBoundingClientRect();
    const slots = [...grid.querySelectorAll('button')].filter(
      (e) => e.getAttribute('data-testid') !== 'attack-button',
    );
    // ordem de leitura 1 2 3 / 4 5 6 / 7 8 9: cada número à direita ou abaixo do anterior
    const cells = [...grid.querySelectorAll('[data-testid^=slot-], [data-testid^=spell-], [data-testid^=potion-]')].map((e) => e.getBoundingClientRect());
    const ordered = cells.every((r, i) => i === 0 || (i % 3 === 0 ? r.top > cells[i - 1]!.top : r.left > cells[i - 1]!.left));
    return {
      onMap,
      total,
      attack: Math.round(atk.width),
      slots: slots.filter((e) => e.getAttribute('data-testid') !== 'select-actor-button').length,
      ordered,
      atkRight: atk.left > Math.max(...cells.map((r) => r.right)),
    };
  });
  expect(gaps.total).toBeGreaterThan(100);
  expect(gaps.onMap).toBe(0);
  expect(gaps.slots).toBe(9); // 9 atalhos (1–9) e, à direita, o botão de ataque
  expect(gaps.attack).toBeLessThanOrEqual(56);
  expect(gaps.ordered).toBe(true);
  expect(gaps.atkRight).toBe(true);

  // 2) segurar o atalho da magia repete a cada recarga; soltar encerra (nada dispara depois)
  const box = (await page.getByTestId('spell-earth_thorn').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const gameNow = () =>
    page.evaluate(() => (window as unknown as { __RPGZIM__: { now(): number } }).__RPGZIM__.now());
  await clear();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  // o relógio do jogo pode andar mais devagar que o real (quadros lentos): espera os disparos, não segundos
  await expect.poll(fired, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: cx - 150, y: cy - 250 }],
  }); // solta com o dedo fora do botão
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await clear();
  // depois de soltar, passam 4,5 s de JOGO (mais que duas recargas) e nada dispara
  const t0 = await gameNow();
  await expect.poll(async () => (await gameNow()) - t0, { timeout: 30_000 }).toBeGreaterThan(4500);
  expect(await fired()).toBe(0);

  // 3) joystick: aparece por cima de tudo (fora da árvore do HUD) enquanto arrasta
  const vp = page.viewportSize()!;
  const ox = vp.width * 0.2;
  const oy = vp.height * 0.7;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ox, y: oy }] });
  for (let i = 1; i <= 5; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: ox + i * 10, y: oy }],
    });
  await expect(page.getByTestId('joystick')).toBeVisible();
  const z = await page
    .getByTestId('joystick')
    .evaluate((el) => ({ inHud: !!el.closest('[data-testid=hud]'), z: Number(getComputedStyle(el).zIndex) }));
  expect(z.inHud).toBe(false);
  expect(z.z).toBeGreaterThanOrEqual(50);
  // o navegador "perdeu" o fim do toque (troca de app, gesto do sistema): o joystick se solta sozinho
  await page.evaluate(() => window.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true })));
  await expect(page.getByTestId('joystick')).toHaveCount(0, { timeout: 3000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // depois de resetar, um novo joystick funciona normalmente
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ox, y: oy }] });
  for (let i = 1; i <= 5; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: ox + i * 10, y: oy }],
    });
  await expect(page.getByTestId('joystick')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('joystick')).toHaveCount(0);

  // 4) mochila: detalhes e ações à vista, sem rolagem e dentro do painel
  await page.getByTestId('btn-inventory').tap();
  await page.getByTestId('bag-0').tap();
  const lay = await page.evaluate(() => {
    const dlg = document.querySelector('[role=dialog]')!.getBoundingClientRect();
    const act = document.querySelector('[data-testid=bag-actions]')!.getBoundingClientRect();
    const det = document.querySelector('[data-testid=item-details]')!.getBoundingClientRect();
    const scrollers = [...document.querySelectorAll('[role=dialog] *')].filter(
      (e) => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY),
    ).length;
    return {
      actionsInside: act.bottom <= dlg.bottom + 1 && act.top >= dlg.top,
      detailsInside: det.bottom <= dlg.bottom + 1,
      scrollers,
    };
  });
  expect(lay.actionsInside).toBe(true);
  expect(lay.detailsInside).toBe(true);
  expect(lay.scrollers).toBe(0);
  await expect(page.getByTestId('bag-organize')).toBeVisible();
});

test('PK: caveira e PZ lock no HUD, nome menor no celular e 9 atalhos', async ({ page }, info) => {
  await createCharacter(page, 'paladin', 'Marca');
  const isMobile = info.project.name === 'mobile';
  // 9 atalhos configuráveis (1–9), na mesma ordem no celular e no desktop
  await expect(
    page.locator('[data-testid^=slot-], [data-testid^=spell-], [data-testid^=potion-]'),
  ).toHaveCount(9);
  // o arco não usa mais flechas: não há contador
  await expect(page.getByTestId('ammo-pill')).toHaveCount(0);
  // caveira branca + PZ lock aparecem ao lado do painel de status
  await page.evaluate(() =>
    (window.__RPGZIM__ as unknown as { setPk(k: string, ms: number): void }).setPk('white', 100_000),
  );
  await expect(page.getByTestId('pk-skull')).toBeVisible();
  await expect(page.getByTestId('pk-pzlock')).toContainText('PZ');
  // tamanho do nome: menor no celular (11 px), maior no desktop (16 px)
  const css = await page.evaluate(() => {
    const a = window.__RPGZIM__ as unknown as { worldTexts(): { text: string; fontSize: string }[] };
    const t = a.worldTexts().find((x) => x.text === 'Marca');
    return t ? parseFloat(t.fontSize) / window.devicePixelRatio : 0;
  });
  if (isMobile) expect(css).toBeLessThanOrEqual(12.5);
  else expect(css).toBeGreaterThanOrEqual(15);
});
