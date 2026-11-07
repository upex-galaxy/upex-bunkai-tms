import type { VarSpec } from './variables-manifest.ts';
import { describe, expect, test } from 'bun:test';
import { validateVarManifest, valueSourceOf, VAR_MANIFEST, varsFor } from './variables-manifest.ts';

// BK-1619 — ATLASSIAN_URL is dev-tooling only. The app stopped reading it at
// runtime in BK-1170 (the Jira site is a per-workspace setting), so it must reach
// neither Vercel nor `.env`, while staying in the manifest for the installer.

describe('variables manifest: ATLASSIAN_URL', () => {
  const spec = VAR_MANIFEST.find(s => s.name === 'ATLASSIAN_URL');

  test('stays declared, sourced from the yaml, and is critical for the installer', () => {
    expect(spec).toBeDefined();
    expect(valueSourceOf(spec!)).toBe('atlassian-instance');
    expect(spec!.critical).toBe(true);
  });

  test('is pushed to no destination: not Vercel, not .env', () => {
    expect(spec!.destinations).toEqual([]);
    expect(spec!.scopes).toBeUndefined();
    expect(varsFor('vercel').map(s => s.name)).not.toContain('ATLASSIAN_URL');
    expect(varsFor('local').map(s => s.name)).not.toContain('ATLASSIAN_URL');
  });

  test('the other Atlassian credentials stay local-only', () => {
    for (const name of ['ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN']) {
      expect(VAR_MANIFEST.find(s => s.name === name)!.destinations).toEqual(['local']);
    }
  });
});

describe('validateVarManifest', () => {
  test('accepts the shipped manifest', () => {
    expect(() => validateVarManifest()).not.toThrow();
  });

  test('still refuses an .env-sourced var with no destination', () => {
    const bad: VarSpec = { name: 'BK1619_TEST_ONLY', destinations: [], secret: false, required: false, critical: false, obtainHint: 'n/a', note: 'test' };
    VAR_MANIFEST.push(bad);
    try {
      expect(() => validateVarManifest()).toThrow(/no destinations/);
    }
    finally {
      VAR_MANIFEST.splice(VAR_MANIFEST.indexOf(bad), 1);
    }
  });
});
