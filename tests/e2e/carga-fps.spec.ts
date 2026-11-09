// Ferramenta de medição (só roda com RPGZIM_LOAD=1): FPS real no navegador com N personagens de IA no mundo.
import { test } from '@playwright/test';

// GPU de verdade (o padrão dos testes é renderização por software, que não serve para medir FPS)
test.use({
  launchOptions: {
    args: [
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
    ],
  },
});

type Api = { ready(): boolean; fps(): number; spawnBots(n: number): number };

test('capacidade no navegador (FPS)', async ({ page }, info) => {
  test.skip(!process.env.RPGZIM_LOAD || info.project.name !== 'desktop', 'ferramenta de medição');
  test.setTimeout(600_000);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByTestId('voc-knight').click();
  await page.getByTestId('name-input').fill('Carga');
  await page.getByRole('button', { name: 'Começar aventura' }).click();
  await page.waitForFunction(() => (window.__RPGZIM__ as Api | undefined)?.ready?.() === true, null, { timeout: 30_000 });
  const rows: string[] = [];
  let total = 0;
  for (const target of (process.env.LOAD_N ?? '0,20,40,80,120').split(',').map(Number)) {
    total = await page.evaluate((n) => (window.__RPGZIM__ as Api).spawnBots(n), target - total + 0);
    total = target;
    await page.waitForTimeout(15_000); // espalham-se pelo mapa
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      samples.push(await page.evaluate(() => (window.__RPGZIM__ as Api).fps()));
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    if (target === 0)
      console.log(
        'GPU',
        await page.evaluate(() => {
          const c = document.createElement('canvas').getContext('webgl');
          const d = c?.getExtension('WEBGL_debug_renderer_info');
          return d ? c!.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/d';
        }),
      );
    rows.push(
      `${String(target).padStart(4)} bots + heróis: ${avg.toFixed(0)} fps (mín ${Math.min(...samples)})`,
    );
  }
  console.log('\n=== FPS no navegador ===\n' + rows.join('\n'));
});
