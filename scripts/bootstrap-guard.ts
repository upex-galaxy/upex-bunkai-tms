#!/usr/bin/env bun
/**
 * bootstrap-guard.ts: does this repo already hold an application?
 *
 * `/project-bootstrap` runs it at entry, before its session plan. The base
 * phases (backend setup, frontend setup) only create, so on an existing app
 * they are refused and the work routes to `/project-adoption`; the add-on
 * phases stay available and read the `stack:` block. Signals and rationale:
 * `cli/lib/bootstrap-guard.ts`.
 *
 * USAGE
 *   bun run bootstrap:guard           # verdict + evidence, human-readable
 *   bun run bootstrap:guard --json    # the same as JSON
 *
 * EXIT CODES
 *   0  greenfield: the base phases may run
 *   2  existing app: the base phases are refused
 *   1  bad arguments
 */

import process from 'node:process';
import { detectExistingApp } from '../cli/lib/bootstrap-guard.ts';

const args = process.argv.slice(2);
const unknown = args.filter(a => a !== '--json');
if (unknown.length > 0) {
  process.stderr.write(`Unknown argument: ${unknown.join(' ')}\nUsage: bun run bootstrap:guard [--json]\n`);
  process.exit(1);
}

const result = detectExistingApp(process.cwd());

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
else if (result.verdict === 'greenfield') {
  process.stdout.write(`Verdict: greenfield (no application found; inspected: ${result.inspected.join(', ')})\n`);
  process.stdout.write('The /project-bootstrap base phases may run.\n');
}
else {
  process.stdout.write('Verdict: existing-app\n');
  for (const s of result.signals) { process.stdout.write(`  - ${s.kind}: ${s.evidence}\n`); }
  process.stdout.write('\nThe /project-bootstrap base phases (backend setup, frontend setup) are refused here: every step in them creates, and this app already exists.\n');
  process.stdout.write('Teach the agentic layer this app with /project-adoption; its design identity comes from /design-system extract.\n');
  process.stdout.write('The add-on phases (OpenAPI, API routes, bearer auth, env URLs, Supabase types) stay available and read the stack: block.\n');
}

process.exit(result.verdict === 'greenfield' ? 0 : 2);
