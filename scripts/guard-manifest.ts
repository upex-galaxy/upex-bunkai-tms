#!/usr/bin/env bun
/**
 * GUARD manifest generator (rule R4).
 *
 * Lists every feature under the features root and the names its public
 * `index.ts` exports, so agents read one file before creating a feature or an
 * action instead of scanning the tree.
 *
 * Usage:
 *   bun run guard:manifest                  # write guard-manifest.json
 *   bun run guard:manifest:check            # exit 1 when the file is stale
 *   bun scripts/guard-manifest.ts --root <dir> --out <file> [--check]
 *
 * The features root is `--root`, else `stack.conventions.features_root` of
 * `.agents/project.yaml` (relative to `stack.app_root`), else `src/features`.
 * With no features folder there is nothing to list: one line, exit 0.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// Mirrors GUARD_ENFORCEMENT_LEVEL in eslint.config.base.js. At 'error' a warning fails --check.
export const GUARD_ENFORCEMENT_LEVEL: 'warn' | 'error' = 'error';

export const DEFAULT_ROOT = 'src/features';
export const DEFAULT_OUT = 'guard-manifest.json';
export const PROJECT_YAML = '.agents/project.yaml';
const DOORS = ['index.ts', 'index.tsx'];

export interface FeatureEntry {
  name: string
  door: string
  exports: string[]
}

export interface GuardManifest {
  version: '1.0'
  features: FeatureEntry[]
  warnings: string[]
}

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function namesOf(list: string): string[] {
  return list
    .split(',')
    .map(part => part.trim().replace(/^type\s+/, ''))
    .filter(Boolean)
    .map(part => part.split(/\s+as\s+/).pop() ?? part);
}

export function parseExports(source: string): string[] {
  const code = stripComments(source);
  const found = new Set<string>();

  for (const m of code.matchAll(/^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|const|let|var|function\*?|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/gm)) {
    found.add(m[1]);
  }
  for (const m of code.matchAll(/^\s*export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*['"][^'"]+['"])?/gm)) {
    for (const name of namesOf(m[1])) { found.add(name); }
  }
  for (const m of code.matchAll(/^\s*export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/gm)) {
    found.add(m[1]);
  }
  for (const m of code.matchAll(/^\s*export\s+\*\s+from\s*['"]([^'"]+)['"]/gm)) {
    found.add(`* from ${m[1]}`);
  }
  if (/^\s*export\s+default\b/m.test(code)) { found.add('default'); }

  return [...found].sort();
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export function buildManifest(root: string, base: string = process.cwd()): GuardManifest {
  const features: FeatureEntry[] = [];
  const warnings: string[] = [];

  const dirs = readdirSync(root)
    .filter(entry => statSync(join(root, entry)).isDirectory())
    .sort();

  for (const name of dirs) {
    const door = DOORS.find(file => existsSync(join(root, name, file)));
    if (!door) {
      warnings.push(`feature "${name}" has no index.ts or index.tsx door`);
      continue;
    }
    const doorPath = join(root, name, door);
    features.push({
      name,
      door: toPosix(relative(base, doorPath)),
      exports: parseExports(readFileSync(doorPath, 'utf8')),
    });
  }

  const owners = new Map<string, string[]>();
  for (const feature of features) {
    for (const exported of feature.exports) {
      if (exported === 'default' || exported.startsWith('* from ')) { continue; }
      owners.set(exported, [...(owners.get(exported) ?? []), feature.name]);
    }
  }
  for (const [exported, names] of [...owners].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (names.length > 1) {
      warnings.push(`action "${exported}" is exported by ${names.join(' and ')} (possible duplicate)`);
    }
  }

  return { version: '1.0', features, warnings };
}

export function serializeManifest(manifest: GuardManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function isStale(manifest: GuardManifest, existing: string | null): boolean {
  return existing !== serializeManifest(manifest);
}

export function formatWarning(message: string): string {
  return `guard-manifest: ${GUARD_ENFORCEMENT_LEVEL}: ${message}`;
}

interface StackBlock {
  app_root?: unknown
  conventions?: { features_root?: unknown }
}

export function featuresRoot(base: string = process.cwd()): string {
  let stack: StackBlock | undefined;
  try { stack = (Bun.YAML.parse(readFileSync(join(base, PROJECT_YAML), 'utf8')) as { stack?: StackBlock } | null)?.stack; }
  catch { stack = undefined; }
  const configured = stack?.conventions?.features_root;
  const app = typeof stack?.app_root === 'string' && stack.app_root !== '' ? stack.app_root : '.';
  return toPosix(join(app, typeof configured === 'string' && configured !== '' ? configured : DEFAULT_ROOT));
}

function option(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export function main(args: string[]): number {
  const check = args.includes('--check');
  const root = resolve(option(args, '--root') ?? featuresRoot());
  const out = resolve(option(args, '--out') ?? DEFAULT_OUT);

  if (!existsSync(root)) {
    console.log('no features folder: nothing to check');
    return 0;
  }

  const manifest = buildManifest(root);
  for (const warning of manifest.warnings) { console.warn(formatWarning(warning)); }
  const failOnWarnings = GUARD_ENFORCEMENT_LEVEL === 'error' && manifest.warnings.length > 0;

  if (check) {
    const existing = existsSync(out) ? readFileSync(out, 'utf8') : null;
    if (isStale(manifest, existing)) {
      console.error(`guard-manifest: ${toPosix(relative(process.cwd(), out))} is stale. Run: bun run guard:manifest`);
      return 1;
    }
    return failOnWarnings ? 1 : 0;
  }

  writeFileSync(out, serializeManifest(manifest));
  console.log(`guard-manifest: ${manifest.features.length} feature(s) written to ${toPosix(relative(process.cwd(), out))}`);
  return failOnWarnings ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
