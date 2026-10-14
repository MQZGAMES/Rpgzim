// Testes de fluxo no navegador contra o build de produção (vite preview).
// Usa o Chrome instalado no sistema por padrão (PW_CHANNEL=msedge para o Edge, ou "chromium" se baixado).
import { defineConfig, devices } from '@playwright/test';

const channel = process.env.PW_CHANNEL ?? 'chrome';
const launchOptions = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4190/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite preview --port 4190 --strictPort',
    url: 'http://localhost:4190/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel, launchOptions } },
  ],
});
