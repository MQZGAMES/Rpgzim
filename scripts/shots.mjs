// Capturas automatizadas do jogo (inspeção visual e documentação) usando o Chrome/Edge instalado.
// Uso: node scripts/shots.mjs <url> <pastaSaida> [mobile|desktop|landscape] [vocação]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , url = 'http://localhost:5190/', out = 'shots', mode = 'mobile', vocation = 'knight'] = process.argv;
mkdirSync(out, { recursive: true });
const viewports = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const channel = process.env.PW_CHANNEL ?? 'chrome';
const browser = await chromium.launch({ channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext(viewports[mode]);
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const shot = async (name) => page.screenshot({ path: join(out, `${mode}-${name}.png`) });

await page.goto(url + (url.includes('?') ? '&' : '?') + 'debug');
await page.waitForSelector('[data-testid="title-menu"]');
await page.waitForTimeout(400);
await shot('01-title');
await page.getByText('Novo personagem').click();
await page.getByTestId(`voc-${vocation}`).click();
await page.waitForTimeout(300);
await shot('02-create');
await page.getByTestId('name-input').fill('Aria');
await page.getByRole('button', { name: 'Começar aventura' }).click();
try {
  await page.waitForFunction(() => window.__RPGZIM__?.ready?.(), null, { timeout: 20000 });
} catch (e) {
  await shot('ERR');
  console.log(logs.join(String.fromCharCode(10)));
  throw e;
}
await page.waitForTimeout(1500);
await shot('03-temple');
// diálogo com o sacerdote (botão de ação contextual)
await page.evaluate(() => window.__RPGZIM__.teleport(48, 10));
await page.waitForTimeout(400);
await page.getByTestId('interact-button').click();
await page.waitForTimeout(400);
await shot('03b-dialog');
await page.getByRole('button', { name: 'Até logo' }).click();
// loja do ferreiro
await page.evaluate(() => window.__RPGZIM__.teleport(29, 16));
await page.waitForTimeout(400);
await page.getByTestId('interact-button').click();
await page.getByRole('button', { name: 'Ver mercadorias' }).click();
await page.getByTestId('shop-item-shield_iron').click();
await page.waitForTimeout(400);
await shot('03c-shop');
await page.locator('[role=dialog] button[aria-label=Fechar]').first().click();
await page.evaluate(() => window.__RPGZIM__.teleport(47, 12));
await page.waitForTimeout(300);
// passeio: sai do templo
const walk = async (x, y) => {
  await page.evaluate(([a, b]) => window.__RPGZIM__.walkTo(a, b), [x, y]);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => window.__RPGZIM__.idle(), null, { timeout: 30000 });
  await page.waitForTimeout(400);
};
await walk(47, 24);
await shot('04-plaza');
// casa por dentro (telhado oculto)
await walk(29, 43);
await walk(29, 41);
await shot('05-house');
// área de caça
await page.evaluate(() => window.__RPGZIM__.teleport(80, 22));
await page.waitForTimeout(300);
const target = await page.evaluate(() => window.__RPGZIM__.teleportNear('slime', 2));
if (target) await page.evaluate((id) => window.__RPGZIM__.target(id), target);
await page.waitForTimeout(2500);
await shot('06-combat');
const spell = { knight: 'brutal_strike', sorcerer: 'arcane_bolt', druid: 'earth_thorn', paladin: 'holy_arrow' }[vocation];
await page.evaluate((s) => window.__RPGZIM__.cast(s), spell);
await page.waitForTimeout(250);
await shot('07-spell');
await page.waitForTimeout(6000);
await shot('08-after');
await page.getByTestId('btn-inventory').click();
await page.waitForTimeout(400);
await shot('09-inventory');
await page.keyboard.press('Escape');
await page.getByTestId('btn-character').click();
await page.waitForTimeout(400);
await shot('10-character');
console.log(JSON.stringify(await page.evaluate(() => window.__RPGZIM__.player()), null, 0));
console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('React DevTools')).join('\n'));
await browser.close();
