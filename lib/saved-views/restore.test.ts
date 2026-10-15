import { describe, expect, test } from 'bun:test';
import { SAVED_VIEW_COPY } from './constants';
import { resolveRestore, restoreNotice } from './restore';

// BK-443 AC-12 — a saved view whose targets moved on degrades one filter at a
// time and is never deleted.

const MOD_A = '3f2b8c1e-9d4a-4b7e-8a61-2c5d9e0f7a13';
const MOD_B = '7a1c5e90-2b3d-4f68-9c0e-1d2e3f4a5b6c';

describe('resolveRestore', () => {
  test('applies everything when every target still exists', () => {
    const result = resolveRestore('bugs', { module: MOD_A, severity: 'P1,P2' }, { moduleIds: new Set([MOD_A]) });
    expect(result).toEqual({ state: { module: MOD_A, severity: 'P1,P2' }, dropped: [], allDropped: false });
    expect(restoreNotice(result)).toBeNull();
  });

  test('12.1 drops only the archived module and keeps the remaining filters', () => {
    const result = resolveRestore('bugs', { module: MOD_A, severity: 'P1' }, { moduleIds: new Set([MOD_B]) });
    expect(result.state).toEqual({ severity: 'P1' });
    expect(result.dropped).toEqual([{ key: 'module', label: 'Module', reason: 'the module was archived or removed' }]);
    expect(result.allDropped).toBe(false);
    expect(restoreNotice(result)).toBe('The Module filter no longer applies (the module was archived or removed). The other saved filters were applied.');
  });

  test('12.3 reports a fully degraded view and applies nothing', () => {
    const result = resolveRestore('bugs', { module: MOD_A }, { moduleIds: new Set() });
    expect(result.state).toEqual({});
    expect(result.allDropped).toBe(true);
    expect(restoreNotice(result)).toBe(SAVED_VIEW_COPY.allDropped);
  });

  test('names every dropped filter when several no longer apply', () => {
    const result = resolveRestore('traceability', { module: MOD_A, from: '2026-13-01', result: 'fail' }, { moduleIds: new Set() });
    expect(result.state).toEqual({ result: 'fail' });
    expect(restoreNotice(result)).toBe(
      'The Module, From date filters no longer apply (the module was archived or removed; it is no longer offered). The other saved filters were applied.',
    );
  });

  test('drops an enum value the product no longer offers (a whole option disappears)', () => {
    const result = resolveRestore('workbench', { layer: 'Mobile', tag: 'smoke' });
    expect(result.state).toEqual({ tag: 'smoke' });
    expect(result.dropped.map(d => d.key)).toEqual(['layer']);
  });

  test('keeps the valid items of a list and flags the partial drop', () => {
    const result = resolveRestore('bugs', { status: 'open,bogus' });
    expect(result.state).toEqual({ status: 'open' });
    expect(result.dropped).toEqual([{ key: 'status', label: 'Status', reason: 'some of its values are no longer offered' }]);
    expect(result.allDropped).toBe(false);
  });

  test('ignores unknown keys as dropped, never as applied', () => {
    const result = resolveRestore('run_history', { outcome: 'failed', legacy: 'x' });
    expect(result.state).toEqual({ outcome: 'failed' });
    expect(result.dropped.map(d => d.key)).toEqual(['legacy']);
  });

  test('does not validate module ids on a surface that gave no module set', () => {
    const result = resolveRestore('traceability', { module: MOD_A });
    expect(result.state).toEqual({ module: MOD_A });
  });

  test('an empty saved state is not reported as fully degraded', () => {
    const result = resolveRestore('bugs', {});
    expect(result).toEqual({ state: {}, dropped: [], allDropped: false });
  });

  test('does not mutate the saved state it was given', () => {
    const saved = { module: MOD_A, severity: 'P1' };
    resolveRestore('bugs', saved, { moduleIds: new Set() });
    expect(saved).toEqual({ module: MOD_A, severity: 'P1' });
  });
});
