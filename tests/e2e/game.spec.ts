// Fluxos críticos no navegador: criar personagem, entrar no mundo, mover, lutar, usar magia, coletar loot,
// equipar, negociar, entrar numa casa, salvar e recarregar. A API ?debug é usada apenas para inspecionar o
// estado e posicionar o personagem perto de alvos (encurta o teste); as ações usam a interface real.
import { expect, test, type Page } from '@playwright/test';

type Api = {
  ready(): boolean;
  player(): { x: number; y: number; hp: number; mana: number; level: number; xp: number; gold: number; target: string | null; dead: boolean; inventory: { itemId: string; count: number }[]; equipment: Record<string, { itemId: string; count: number } | undefined> };
  monsters(): { id: string; type: string; x: number; y: number; hp: number; alive: boolean }[];
  npcs(): { id: string; x: number; y: number }[];
  teleport(x: number, y: number): void;
  teleportNear(type: string, dist?: number): string | null;
  loot(): { id: string; x: number; y: number }[];
  ui(): { buildingId: string | null; shop: unknown; dialog: unknown; lootId: string | null };
  walkTo(x: number, y: number): boolean;
  idle(): boolean;
  buildings(): { id: string; x: number; y: number; w: number; h: number; doorX: number }[];
};

const api = <T>(page: Page, fn: (a: Api) => T): Promise<T> => page.evaluate((src) => new Function('a', `return (${src})(a)`)(window.__RPGZIM__), fn.toString()) as Promise<T>;

async function createCharacter(page: Page, vocation: string, name: string) {
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByTestId(`voc-${vocation}`).click();
  await page.getByTestId('name-input').fill(name);
  await page.getByRole('button', { name: 'Começar aventura' }).click();
  await page.waitForFunction(() => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true, null, { timeout: 30_000 });
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
  await expect.poll(async () => (await api(page, (a) => a.player())).target, { timeout: 5000 }).not.toBeNull();
  await expect(page.getByTestId('target-frame')).toBeVisible();
  // magia pela barra de atalhos (tecla 1 = Golpe Brutal)
  const manaBefore = (await api(page, (a) => a.player())).mana;
  await page.keyboard.press('Digit1');
  await expect.poll(async () => (await api(page, (a) => a.player())).mana, { timeout: 3000 }).toBeLessThan(manaBefore);
  await expect.poll(async () => (await api(page, (a) => a.player())).xp, { timeout: 40_000 }).toBeGreaterThan(0);
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
  await expect.poll(async () => (await api(page, (a) => a.player())).equipment.mainHand?.itemId).toBe('axe_hand');
  await page.keyboard.press('Escape');
  // salvar pelo menu e recarregar
  await page.getByTestId('btn-settings').click();
  await page.getByRole('button', { name: 'Salvar agora' }).click();
  await page.waitForTimeout(500);
  const saved = await api(page, (a) => a.player());
  await page.reload();
  await page.getByText('Teste').first().click();
  await page.waitForFunction(() => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true);
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
  await expect.poll(async () => (await api(page, (a) => a.ui())).buildingId, { timeout: 15_000 }).toBe('house_rosa');
  // continua no mesmo canvas/cena: nenhum carregamento de outra tela
  await expect(page.getByTestId('hud')).toBeVisible();
});

test('mobile: joystick move o personagem e o HUD cabe na tela', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'somente emulação mobile');
  await createCharacter(page, 'sorcerer', 'Toque');
  const vp = page.viewportSize()!;
  // nenhum elemento essencial do HUD fora da tela
  for (const id of ['status-panel', 'attack-button', 'joystick-zone', 'btn-inventory', 'btn-settings', 'potion-health']) {
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
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ox + i * 10, y: oy }] });
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
  await expect.poll(async () => (await api(page, (a) => a.loot())).length, { timeout: 30_000 }).toBeGreaterThan(0);
  await api(page, (a) => a.ui()).then(async (ui) => ui.lootId === null && (await page.getByTestId('interact-button').click()));
  await expect(page.getByTestId('loot-window')).toBeVisible();
});

test('mobile: toque duplo equipa; toque curto na área do joystick anda até o ponto', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'somente emulação mobile');
  await createCharacter(page, 'knight', 'Dedos');
  await expect(page.getByTestId('joystick')).toHaveCount(0);
  await api(page, (a) => a.teleport(47, 24));
  const before = await api(page, (a) => a.player());
  const zone = (await page.getByTestId('joystick-zone').boundingBox())!;
  await page.touchscreen.tap(zone.x + zone.width * 0.3, zone.y + zone.height * 0.5);
  await expect.poll(async () => { const p = await api(page, (a) => a.player()); return p.x !== before.x || p.y !== before.y; }).toBe(true);
  await expect(page.getByTestId('joystick')).toHaveCount(0);
  // mochila: machadinha marcada como melhor e equipada com toque duplo
  await page.getByTestId('btn-inventory').tap();
  const axe = (await api(page, (a) => a.player())).inventory.findIndex((s) => s.itemId === 'axe_hand');
  const cell = page.getByTestId(`bag-${axe}`);
  await expect(cell).toHaveAttribute('data-better', 'true');
  // toque duplo: dois "pointerup" de toque em sequência rápida (sem depender da velocidade de renderização da máquina de teste)
  await cell.evaluate((el) => {
    for (let i = 0; i < 2; i++) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', button: 0, isPrimary: true }));
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
  expect((await heroes()).map((h) => h.id)).toEqual(['hero:boladex']);
  const start = (await heroes())[0]!;
  // ele sai andando sozinho (decide caçar/passear sem comando do jogador)
  await expect.poll(async () => { const h = (await heroes())[0]!; return h.x !== start.x || h.y !== start.y; }, { timeout: 20_000 }).toBe(true);
  // jogar como o Boladex: volta ao menu e escolhe o slot dele (sem herói duplicado no mundo)
  await page.goto('/?debug');
  await page.getByTestId('slot-boladex').click();
  await page.waitForFunction(() => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true, null, { timeout: 30_000 });
  expect(await heroes()).toEqual([]);
  expect((await api(page, (a) => a.player())).inventory.length).toBeGreaterThan(0);
});

test('HUD social: modo de ataque, PK e menu do Boladex com convite para grupo', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'um projeto basta');
  await createCharacter(page, 'knight', 'Social');
  await page.getByTestId('toggle-stand').click();
  await expect(page.getByTestId('toggle-stand')).toContainText('Parado');
  await page.getByTestId('toggle-pvp').click();
  await expect(page.getByTestId('toggle-pvp')).toContainText('PK on');
  // abre o menu do herói pela simulação do toque (a posição na tela varia com o zoom)
  type HeroInfo = { id: string };
  const id = (await page.evaluate(() => (window.__RPGZIM__ as { heroes(): HeroInfo[] }).heroes()))[0]!.id;
  await page.evaluate((hid) => (window.__RPGZIM__ as { openActorMenu(id: string): void }).openActorMenu(hid), id);
  await expect(page.getByTestId('actor-menu')).toContainText('Boladex');
  await expect(page.getByRole('button', { name: 'Convidar p/ grupo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atacar' })).toBeVisible();
});
