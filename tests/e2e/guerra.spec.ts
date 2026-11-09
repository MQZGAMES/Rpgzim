// Modo guerra nas configurações: ligar as guildas mostra as duas listas (com você numa delas) e liga o PK;
// desligar o PK pelo botão da tela encerra a guerra.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('rpgzim');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
});

test('modo guerra: guildas nas configurações', async ({ page }, info) => {
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByTestId('voc-knight').click();
  await page.getByTestId('name-input').fill('Guerreiro');
  await page.getByRole('button', { name: 'Começar aventura' }).click();
  await page.waitForFunction(
    () => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true,
    null,
    { timeout: 30_000 },
  );
  await page.getByTestId('btn-settings').click();
  await page.getByTestId('war-guilds').click();
  await expect(page.locator('[data-testid="war-guild-lists"] >> text=Guerreiro')).toBeVisible();
  await expect(page.getByText('· sua')).toBeVisible();
  await page.getByTestId('war-options').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('guerra-config.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('toggle-pvp')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('toggle-pvp').click();
  await page.getByTestId('btn-settings').click();
  await expect(page.getByTestId('war-off')).toBeVisible();
  await expect(page.getByTestId('war-guild-lists')).toHaveCount(0);
});

test('modo guerra: a escolha continua valendo depois de fechar e reabrir o menu', async ({ page }) => {
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByTestId('voc-knight').click();
  await page.getByTestId('name-input').fill('Teimoso');
  await page.getByRole('button', { name: 'Começar aventura' }).click();
  await page.waitForFunction(
    () => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true,
    null,
    { timeout: 30_000 },
  );
  for (const mode of ['ffa', 'guilds'] as const) {
    await page.getByTestId('btn-settings').click();
    await page.getByTestId(`war-${mode}`).click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId(`war-${mode}`)).toHaveClass(/gold/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);
    await page.getByTestId('btn-settings').click();
    await expect(page.getByTestId(`war-${mode}`)).toHaveClass(/gold/);
    await page.keyboard.press('Escape');
  }
});

test('modo guerra: funciona com um personagem já salvo (sair e entrar de novo)', async ({ page }) => {
  const ready = () =>
    page.waitForFunction(() => (window.__RPGZIM__ as { ready?: () => boolean } | undefined)?.ready?.() === true, null, {
      timeout: 30_000,
    });
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByTestId('voc-druid').click();
  await page.getByTestId('name-input').fill('Antigo');
  await page.getByRole('button', { name: 'Começar aventura' }).click();
  await ready();
  await page.waitForTimeout(3000);
  await page.getByTestId('btn-settings').click();
  await page.getByRole('button', { name: 'Salvar e sair' }).click();
  await page.getByRole('button', { name: /Antigo/ }).first().click();
  await ready();
  await page.waitForTimeout(3000);
  for (const mode of ['ffa', 'guilds'] as const) {
    await page.getByTestId('btn-settings').click();
    await page.getByTestId(`war-${mode}`).click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId(`war-${mode}`)).toHaveClass(/gold/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(4000);
    await page.getByTestId('btn-settings').click();
    await expect(page.getByTestId(`war-${mode}`)).toHaveClass(/gold/);
    await page.keyboard.press('Escape');
  }
});
