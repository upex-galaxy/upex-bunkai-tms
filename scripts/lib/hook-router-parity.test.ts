import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

import { parseRouterRows } from '../../.agents/hooks/personality-reinject.mjs';
import { parseRouter } from './instructions.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');

// The prompt hook carries its own dependency-free copy of the router grammar
// (it runs on every prompt, with Node built-ins only). It must read the
// AGENTS.md router exactly as `instructions:check` does, or the table the
// lint proves reachable is not the table the hook routes with.
test('the prompt hook parses the AGENTS.md router exactly as instructions:check does', () => {
  const l0 = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  const hook = parseRouterRows(l0);
  const lint = parseRouter(l0);
  expect(hook).not.toBeNull();
  expect(hook!.map(row => [row.kind, row.targets])).toEqual(lint!.map(row => [row.kind, row.targets]));
});
