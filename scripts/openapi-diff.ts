#!/usr/bin/env bun
/**
 * Compares the generated `public/openapi.json` against the planned spec at
 * `.context/SRS/api-contracts.yaml` and reports added / removed / changed
 * operations.
 *
 * Output is informational. Exit code is always 0 — drift between SRS and
 * implementation is expected during bootstrap. Re-run after each story to see
 * what's still unimplemented.
 *
 * Normalisation:
 *   - The SRS lists paths relative to its `/api/v1` server (e.g. `/health`).
 *   - The generated spec lists absolute paths (`/api/v1/health`).
 *   This script strips the `/api/v1` prefix from generated paths before
 *   comparing.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'yaml';

interface MinimalOpenApi {
  paths?: Record<string, Record<string, unknown>>
}

const GENERATED_PATH = resolve(process.cwd(), 'public/openapi.json');
const SRS_PATH = resolve(process.cwd(), '.context/SRS/api-contracts.yaml');
const SERVER_PREFIX = '/api/v1';
const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);

function readSpec(path: string, kind: 'json' | 'yaml'): MinimalOpenApi {
  const raw = readFileSync(path, 'utf8');
  const parsed = kind === 'json' ? JSON.parse(raw) : yaml.parse(raw);
  return parsed as MinimalOpenApi;
}

function stripServerPrefix(path: string): string {
  return path.startsWith(SERVER_PREFIX) ? path.slice(SERVER_PREFIX.length) || '/' : path;
}

function collectOperations(spec: MinimalOpenApi, normalisePath: (p: string) => string) {
  const ops = new Map<string, { tag?: string, summary?: string }>();
  for (const [rawPath, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }
    const path = normalisePath(rawPath);
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }
      const opObj = (op ?? {}) as { tags?: string[], summary?: string };
      ops.set(`${method.toUpperCase()} ${path}`, {
        tag: opObj.tags?.[0],
        summary: opObj.summary,
      });
    }
  }
  return ops;
}

const generated = readSpec(GENERATED_PATH, 'json');
const srs = readSpec(SRS_PATH, 'yaml');

const generatedOps = collectOperations(generated, stripServerPrefix);
const srsOps = collectOperations(srs, p => p);

const added: string[] = [];
const removed: string[] = [];
const shared: string[] = [];

for (const key of generatedOps.keys()) {
  if (srsOps.has(key)) {
    shared.push(key);
  }
  else {
    added.push(key);
  }
}
for (const key of srsOps.keys()) {
  if (!generatedOps.has(key)) {
    removed.push(key);
  }
}

added.sort();
removed.sort();
shared.sort();

function formatOp(key: string, meta: { tag?: string, summary?: string }): string {
  const tag = meta.tag ? ` (${meta.tag})` : '';
  const summary = meta.summary ? ` — ${meta.summary}` : '';
  return `  ${key}${tag}${summary}`;
}

console.log('OpenAPI diff: public/openapi.json vs .context/SRS/api-contracts.yaml');
console.log('');
console.log(`Generated: ${generatedOps.size} operations · SRS: ${srsOps.size} operations`);
console.log(`Implemented per SRS: ${shared.length}`);
console.log(`Added (in spec, not in SRS): ${added.length}`);
console.log(`Removed (in SRS, not yet implemented): ${removed.length}`);
console.log('');

if (added.length > 0) {
  console.log('Added paths (in spec, not in SRS):');
  for (const key of added) {
    console.log(formatOp(key, generatedOps.get(key)!));
  }
  console.log('');
}

if (removed.length > 0) {
  console.log('Removed paths (in SRS, not yet implemented):');
  for (const key of removed) {
    console.log(formatOp(key, srsOps.get(key)!));
  }
  console.log('');
}

if (shared.length > 0) {
  console.log('Shared operations (present in both):');
  for (const key of shared) {
    console.log(formatOp(key, generatedOps.get(key)!));
  }
}
