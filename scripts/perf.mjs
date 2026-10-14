// Medição de desempenho no navegador: FPS médio/mínimo em cenários típicos.
// Uso: node scripts/perf.mjs <url> [gpu|swiftshader] [mobile|desktop]
import { chromium } from '@playwright/test';

const [, , url = 'http://localhost:4190/', gl = 'gpu', mode = 'mobile'] = process.argv;
const args = gl === 'gpu' ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', args });
const ctx = await browser.newContext(
  mode === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } },
);
const page = await ctx.newPage();
await page.goto(url + '?debug');
await page.getByText('Novo personagem').click();
await page.getByTestId('voc-sorcerer').click();
await page.getByTestId('name-input').fill('Perf');
await page.getByRole('button', { name: 'Começar aventura' }).click();
await page.waitForFunction(() => window.__RPGZIM__?.ready?.());
const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl');
  const ext = c?.getExtension('WEBGL_debug_renderer_info');
  return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecido';
});
const sample = async (label, ms) => {
  const res = await page.evaluate(async (dur) => {
    const frames = [];
    let last = performance.now();
    const end = last + dur;
    await new Promise((resolve) => {
      const tick = (t) => {
        frames.push(t - last);
        last = t;
        if (t < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    frames.shift();
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    return { fps: Math.round(1000 / avg), p95ms: Math.round(p95 * 10) / 10, frames: frames.length };
  }, ms);
  console.log(`${label.padEnd(28)} ${res.fps} FPS médio · p95 ${res.p95ms} ms/quadro · ${res.frames} quadros`);
};
await page.waitForTimeout(1500);
await sample('templo (parado)', 4000);
await page.evaluate(() => window.__RPGZIM__.walkTo(47, 30));
await sample('praça (caminhando)', 4000);
await page.evaluate(() => window.__RPGZIM__.teleport(80, 22));
await page.evaluate(() => window.__RPGZIM__.teleportNear('slime', 3));
await page.evaluate(() => { const m = window.__RPGZIM__.monsters().find((x) => x.alive && x.type === 'slime'); return m && window.__RPGZIM__.target(m.id); });
await sample('bosque (combate)', 5000);
console.log(`renderizador: ${renderer} · modo ${mode} · ${gl}`);
await browser.close();
