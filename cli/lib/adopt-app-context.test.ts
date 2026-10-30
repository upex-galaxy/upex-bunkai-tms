import type { AdoptInstructionSource } from './updater-adopt.ts';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import {
  APP_CONTEXT_POINTER_HEADING,
  appContextDescription,
  appContextRouterRow,
  appContextSlug,
  appIdentity,
  appInstructionsCoverage,
  buildAppContextSkill,
  composeAdoptedL0,
  kebab,
  sourceTopics,
  withAppContextPointer,
} from './adopt-app-context.ts';
import { isProjectLocalSkillPath } from './updater-core';

const roots: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'app-context-'));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

const L0 = '# AGENTS.md\n\n<!-- router:start -->\n| Kind | Load | Also |\n|---|---|---|\n| git | `.agents/instructions/agent-git.md` | - |\n<!-- router:end -->\n\n## 1. CRITICAL RULES\n';
const APP = { name: 'shop-web', description: 'Storefront for Acme.' };
const SOURCES: AdoptInstructionSource[] = [
  { file: 'AGENTS.md', text: '# Shop agents\n\n## 1. Checkout rules\n\nNever charge twice.\n\n```md\n## not a heading\n```\n\n## **Inventory** sync\n\nShipped today.\n\n' },
  { file: 'CLAUDE.md', text: '# Memory\n\n## Checkout rules\n\nUse pnpm.\n' },
];

describe('slug and identity', () => {
  test('kebab drops the npm scope and every non-alphanumeric run', () => {
    expect(kebab('@acme/Shop Web_v2')).toBe('shop-web-v2');
    expect(kebab('@@@')).toBe('');
  });

  test('appIdentity reads package.json, else the folder name', () => {
    const root = tempRoot();
    expect(appIdentity(root).name).toBe(root.split('/').pop()!);
    writeFileSync(join(root, 'package.json'), '{"name":"@acme/shop-web","description":"Storefront."}');
    expect(appIdentity(root)).toEqual({ name: 'shop-web', description: 'Storefront.' });
    // A scaffolder's default name names the generator, not the app: the folder wins.
    for (const placeholder of ['my-v0-project', 'my-app', 'nextjs-app', 'next', 'project']) {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: placeholder }));
      expect(appIdentity(root).name).toBe(root.split('/').pop()!);
    }
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'my-shop' }));
    expect(appIdentity(root).name).toBe('my-shop');
  });

  test('the slug ends in -context once, is project-local, and steps aside from a skill upstream ships', () => {
    expect(appContextSlug('shop-context', null)).toBe('shop-context');
    expect(appContextSlug('***', null)).toBe('app-context');
    const upstream = tempRoot();
    mkdirSync(join(upstream, '.agents', 'skills', 'project-context'), { recursive: true });
    const slug = appContextSlug('project', upstream);
    expect(slug).toBe('project-app-context');
    expect(isProjectLocalSkillPath(`.agents/skills/${slug}/SKILL.md`)).toBe(true);
  });
});

describe('the skill', () => {
  test('sourceTopics: ## headings outside code, as plain words, each once', () => {
    expect(sourceTopics(SOURCES)).toEqual(['Checkout rules', 'Inventory sync']);
  });

  test('description routes by the app and its own section titles, and fits the 1024-character cap', () => {
    const d = appContextDescription(APP, SOURCES);
    expect(d).toContain('shop-web\'s own instructions (Storefront for Acme)');
    expect(d).toContain('Covers: Checkout rules; Inventory sync.');
    const many: AdoptInstructionSource[] = [{ file: 'AGENTS.md', text: Array.from({ length: 200 }, (_, i) => `## Topic number ${i}\n`).join('') }];
    const long = appContextDescription(APP, many);
    expect(long.length).toBeLessThanOrEqual(1024);
    expect(long).toContain('Topic number 0');
    expect(long).toContain('Load it before working on');
  });

  test('SKILL.md frontmatter is valid YAML: the slug, a context kind, the description', () => {
    const skill = buildAppContextSkill('shop-web-context', APP, SOURCES, null);
    const meta = parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(skill.skillMd)![1]) as { name: string, description: string, metadata: { kind: string } };
    expect(meta.name).toBe('shop-web-context');
    expect(meta.metadata.kind).toBe('context');
    expect(meta.description).toBe(appContextDescription(APP, SOURCES));
    expect(skill.dir).toBe('.agents/skills/shop-web-context');
  });

  test('the reference holds every source verbatim with every heading: coverage is complete', () => {
    const skill = buildAppContextSkill('shop-web-context', APP, SOURCES, '.backups/x');
    expect(skill.reference).toContain('`.backups/x/`');
    const cov = appInstructionsCoverage(SOURCES, skill.reference);
    expect(cov.missingSources).toEqual([]);
    expect(cov.missingHeadings).toEqual([]);
    expect(cov.referenceBytes).toBeGreaterThan(cov.sourceBytes);
  });

  test('coverage names what a lossy copy dropped', () => {
    const cov = appInstructionsCoverage(SOURCES, '# Shop agents\n\n## 1. Checkout rules\n');
    expect(cov.missingSources).toEqual(['AGENTS.md', 'CLAUDE.md']);
    // Stricter than sourceTopics on purpose: a heading-shaped line inside a code fence counts too.
    expect(cov.missingHeadings).toEqual(['## not a heading', '## **Inventory** sync', '# Memory', '## Checkout rules']);
  });
});

describe('the always-on file and the overlay', () => {
  test('composeAdoptedL0 adds exactly one router row, last, and is idempotent', () => {
    const out = composeAdoptedL0(L0, 'shop-web-context', 'shop-web');
    const row = appContextRouterRow('shop-web-context', 'shop-web');
    expect(out).toBe(L0.replace('<!-- router:end -->', `${row}\n<!-- router:end -->`));
    expect(composeAdoptedL0(out, 'shop-web-context', 'shop-web')).toBe(out);
    expect(row).toContain('`.agents/skills/shop-web-context/SKILL.md`');
  });

  test('composeAdoptedL0 drops upstream\'s router lock: the added row is the app\'s, not the locked table', () => {
    const lockedL0 = L0.replace('<!-- router:end -->', '<!-- router:end -->\n<!-- router:lock 0123456789ab ADR-0014 -->');
    const out = composeAdoptedL0(lockedL0, 'shop-web-context', 'shop-web');
    expect(out).not.toContain('router:lock');
    expect(out).toBe(composeAdoptedL0(L0, 'shop-web-context', 'shop-web'));
  });

  test('an upstream without a router is left as it is', () => {
    expect(composeAdoptedL0('# Old\n\n## 1. RULES\n', 's-context', 's')).toBe('# Old\n\n## 1. RULES\n');
  });

  test('withAppContextPointer appends one section, once', () => {
    const once = withAppContextPointer('---\nid: project\n---\n\n# Project instructions\n\n', 'shop-web-context', 'shop-web');
    expect(once).toContain(`${APP_CONTEXT_POINTER_HEADING}\n`);
    expect(once).toContain('`.agents/skills/shop-web-context/references/app-instructions.md`');
    expect(withAppContextPointer(once, 'shop-web-context', 'shop-web')).toBe(once);
  });
});
