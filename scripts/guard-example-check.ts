import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = join(import.meta.dir, '..');
const example = join(root, 'packages', 'guard-example');

if (!existsSync(example)) {
  console.log('guard:example:check: packages/guard-example is not in this project (it ships with the boilerplate only), nothing to check');
  process.exit(0);
}

const steps: Array<{ cwd: string, cmd: string[] }> = [
  { cwd: example, cmd: ['bunx', 'eslint', '--max-warnings', '0', 'src'] },
  { cwd: example, cmd: ['bunx', 'tsc', '-p', 'tsconfig.json'] },
  { cwd: example, cmd: ['bun', join(root, 'scripts', 'guard-manifest.ts'), '--root', 'src/features', '--check', '--out', 'guard-manifest.json'] },
  { cwd: root, cmd: ['bun', 'test', '--preload', './packages/guard-example/test-setup.ts', 'packages/guard-example'] },
];

for (const step of steps) {
  const result = spawnSync(step.cmd[0], step.cmd.slice(1), { cwd: step.cwd, stdio: 'inherit' });
  if (result.status !== 0) { process.exit(result.status ?? 1); }
}
