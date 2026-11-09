// Toque no X de um painel (celular): o click sintético do mesmo toque não pode cair no que estava embaixo do X depois
// que o painel some (no app em tela cheia, o X do menu fica em cima do botão de PK — fechar o menu desligava o PK e
// o modo guerra).
import { expect, test } from '@playwright/test';

test('fechar o menu pelo X (toque) não aciona o que está embaixo e mantém o modo guerra', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'toque');
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByTestId('voc-knight').click();
  await page.getByTestId('name-input').fill('Toque');
  await page.getByRole('button', { name: 'Começar aventura' }).click();
  await page.waitForFunction(
    () => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true,
    null,
    { timeout: 30_000 },
  );
  await page.getByTestId('btn-settings').tap();
  await page.getByTestId('war-ffa').tap();
  await page.waitForTimeout(500);
  // registra (na fase normal) qualquer click que chegue em algum lugar depois do toque no X
  await page.evaluate(() => {
    const w = window as unknown as { __clicks: string[] };
    w.__clicks = [];
    document.addEventListener('click', (e) => w.__clicks.push((e.target as HTMLElement).tagName));
  });
  await page.getByRole('button', { name: 'Fechar' }).tap();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks)).toEqual([]);
  await expect(page.getByTestId('toggle-pvp')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('btn-settings').tap();
  await expect(page.getByTestId('war-ffa')).toHaveClass(/gold/);
});
