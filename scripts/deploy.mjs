// Publica a pasta dist/ no branch gh-pages (GitHub Pages).
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const remote = execSync('git remote get-url origin').toString().trim();
const name = execSync('git config user.name').toString().trim();
const email = execSync('git config user.email').toString().trim();
const rev = execSync('git rev-parse --short HEAD').toString().trim();
const dist = resolve('dist');
writeFileSync(join(dist, '.nojekyll'), '');
const tmp = mkdtempSync(join(tmpdir(), 'rpgzim-deploy-'));
cpSync(dist, tmp, { recursive: true });
const run = (c) => execSync(c, { cwd: tmp, stdio: 'inherit' });
run('git init -q');
run('git checkout -q -b gh-pages');
run(`git config user.name "${name}"`);
run(`git config user.email "${email}"`);
run('git add -A');
run(`git commit -q -m "Deploy ${rev}"`);
run(`git push -q -f ${remote} gh-pages`);
rmSync(tmp, { recursive: true, force: true });
console.log('Publicado no gh-pages (' + rev + ')');
