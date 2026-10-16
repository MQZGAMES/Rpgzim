/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { execSync } from 'node:child_process';

/** Após o build, grava no service worker a lista de arquivos do jogo e uma versão nova do cache,
 * para que ele funcione offline já depois da primeira visita (e troque o cache a cada publicação). */
function precacheServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'rpgzim-precache',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const full = join(dir, f);
          if (statSync(full).isDirectory()) walk(full);
          else files.push('./' + relative(outDir, full).replace(/\\/g, '/'));
        }
      };
      walk(outDir);
      const list = files.filter((f) => f !== './sw.js' && !f.endsWith('.map'));
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace('/*__PRECACHE__*/ []', JSON.stringify(list))
        .replace("'rpgzim-dev'", `'rpgzim-${Date.now().toString(36)}'`);
      writeFileSync(swPath, sw);
    },
  };
}

// base relativo: o build funciona tanto na raiz quanto em subpastas (ex.: GitHub Pages /Rpgzim/).
/** Versão exibida no jogo: data da publicação + commit (ajuda a saber se o navegador pegou a versão nova). */
function buildVersion(): string {
  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    /* sem git */
  }
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${commit ? '·' + commit : ''}`;
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(buildVersion()) },
  plugins: [react(), tailwindcss(), precacheServiceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  test: {
    include: process.env.RPGZIM_TOOLS ? ['tests/tools/**/*.test.ts'] : ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
