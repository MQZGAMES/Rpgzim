/// <reference types="vite/client" />

interface Window {
  /** API de depuração/testes automatizados (somente em desenvolvimento ou com ?debug). */
  __RPGZIM__?: unknown;
}

/** Versão do build (data + commit), definida em vite.config.ts. */
declare const __APP_VERSION__: string;
