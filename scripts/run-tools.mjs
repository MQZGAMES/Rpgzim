// Executa as ferramentas de desenvolvimento baseadas em Vitest (ex.: render do mundo em PNG).
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['vitest', 'run'], { stdio: 'inherit', shell: true, env: { ...process.env, RPGZIM_TOOLS: '1' } });
process.exit(r.status ?? 1);
