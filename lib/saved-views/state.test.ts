import { ATC_LAYERS, ATC_PRIORITIES, ATC_TECHNIQUES } from '@lib/atcs/validation';
import { describe, expect, test } from 'bun:test';
import { clampSavedViewText } from './constants';
import {
  FACET_UNSPECIFIED,
  isStateEmpty,
  keyLabel,
  mergeStateIntoParams,
  normalizeValue,
  stateFromParams,
  stateKeys,
  validateStateForKind,
  WORKBENCH_LAYERS,
  WORKBENCH_PRIORITIES,
  WORKBENCH_TECHNIQUES,
} from './state';

// BK-443 — the codec between a surface's address and a saved view's state.

const MODULE_ID = '3f2b8c1e-9d4a-4b7e-8a61-2c5d9e0f7a13';

describe('drift guard', () => {
  test('the restated workbench enums match the ATC validation source', () => {
    expect([...WORKBENCH_TECHNIQUES]).toEqual([...ATC_TECHNIQUES]);
    expect([...WORKBENCH_PRIORITIES]).toEqual([...ATC_PRIORITIES]);
    expect([...WORKBENCH_LAYERS]).toEqual([...ATC_LAYERS]);
  });

  test('each surface exposes exactly the params it already writes to its address', () => {
    expect(stateKeys('traceability')).toEqual(['result', 'module', 'from', 'to']);
    expect(stateKeys('run_history')).toEqual(['outcome']);
    expect(stateKeys('bugs')).toEqual(['module', 'status', 'severity']);
    expect(stateKeys('workbench')).toEqual(['atc_q', 'tag', 'technique', 'priority', 'layer']);
  });
});

describe('clampSavedViewText', () => {
  test('leaves short text alone and cuts at 100 code points, not UTF-16 units', () => {
    expect(clampSavedViewText('login')).toBe('login');
    expect(clampSavedViewText('x'.repeat(150))).toHaveLength(100);
    const emoji = clampSavedViewText('😀'.repeat(150));
    expect(Array.from(emoji)).toHaveLength(100);
    expect(emoji).toBe('😀'.repeat(100));
  });

  test('what the control keeps is never dropped from the state', () => {
    const typed = clampSavedViewText('q'.repeat(300));
    expect(stateFromParams('workbench', new URLSearchParams({ atc_q: typed }))).toEqual({ atc_q: typed });
  });
});

describe('stateFromParams (lenient)', () => {
  test('reads only the surface\'s own keys and ignores foreign params', () => {
    const params = new URLSearchParams(`story=abc&module=${MODULE_ID}&result=fail`);
    expect(stateFromParams('traceability', params)).toEqual({ module: MODULE_ID, result: 'fail' });
  });

  test('canonicalizes a result list: allowed order, no duplicates, junk items dropped', () => {
    const params = new URLSearchParams('result=fail,pass,fail,bogus');
    expect(stateFromParams('traceability', params)).toEqual({ result: 'pass,fail' });
  });

  test('drops a value that is entirely invalid instead of throwing', () => {
    const params = new URLSearchParams('from=2026-13-45&to=not-a-date&module=nope');
    expect(stateFromParams('traceability', params)).toEqual({});
  });

  test('reads the bugs filters', () => {
    const params = new URLSearchParams(`module=${MODULE_ID}&status=open,in_progress&severity=P2,P1`);
    expect(stateFromParams('bugs', params)).toEqual({ module: MODULE_ID, status: 'open,in_progress', severity: 'P1,P2' });
  });

  test('reads a run-history outcome and refuses an unknown one', () => {
    expect(stateFromParams('run_history', new URLSearchParams('outcome=failed'))).toEqual({ outcome: 'failed' });
    expect(stateFromParams('run_history', new URLSearchParams('outcome=running'))).toEqual({});
  });

  test('reads the workbench filters, trims text, and maps the unspecified facet', () => {
    const params = new URLSearchParams({ atc_q: '  login ', tag: 'smoke', technique: FACET_UNSPECIFIED, priority: 'High', layer: 'API' });
    expect(stateFromParams('workbench', params)).toEqual({ atc_q: 'login', tag: 'smoke', technique: FACET_UNSPECIFIED, priority: 'High', layer: 'API' });
  });

  test('drops blank and over-long workbench text', () => {
    const params = new URLSearchParams({ atc_q: '   ', tag: 'x'.repeat(101) });
    expect(stateFromParams('workbench', params)).toEqual({});
  });
});

describe('inherited names are not filters', () => {
  test('normalizeValue and keyLabel treat them as unknown', () => {
    expect(normalizeValue('bugs', 'constructor', 'x', false)).toBeNull();
    expect(normalizeValue('bugs', '__proto__', 'x', true)).toBeNull();
    expect(keyLabel('bugs', 'toString')).toBe('toString');
  });

  test('mergeStateIntoParams ignores them and stateFromParams never reads them', () => {
    const merged = mergeStateIntoParams('bugs', new URLSearchParams(), { constructor: 'x', severity: 'P1' });
    expect(merged.toString()).toBe('severity=P1');
    expect(stateFromParams('bugs', new URLSearchParams('constructor=x&toString=y'))).toEqual({});
  });
});

describe('mergeStateIntoParams', () => {
  test('keeps foreign params (story, the Command Palette module) and writes the state', () => {
    const current = new URLSearchParams('story=abc&other=1');
    const merged = mergeStateIntoParams('traceability', current, { result: 'fail', from: '2026-09-01' });
    expect(merged.get('story')).toBe('abc');
    expect(merged.get('other')).toBe('1');
    expect(merged.get('result')).toBe('fail');
    expect(merged.get('from')).toBe('2026-09-01');
  });

  test('replaces rather than merges: an axis the view does not hold is cleared', () => {
    const current = new URLSearchParams(`story=abc&result=pass&module=${MODULE_ID}&to=2026-09-30`);
    const merged = mergeStateIntoParams('traceability', current, { result: 'fail' });
    expect(merged.get('result')).toBe('fail');
    expect(merged.has('module')).toBe(false);
    expect(merged.has('to')).toBe(false);
    expect(merged.get('story')).toBe('abc');
  });

  test('does not touch the input params and ignores keys of another surface', () => {
    const current = new URLSearchParams('result=pass');
    const merged = mergeStateIntoParams('run_history', current, { outcome: 'failed', result: 'fail' });
    expect(current.toString()).toBe('result=pass');
    expect(merged.get('result')).toBe('pass');
    expect(merged.get('outcome')).toBe('failed');
  });

  test('an empty state clears every key of the surface', () => {
    const merged = mergeStateIntoParams('bugs', new URLSearchParams('status=open&severity=P1&keep=1'), {});
    expect(merged.toString()).toBe('keep=1');
  });

  test('round-trips: merge then read returns the same state', () => {
    const state = { module: MODULE_ID, status: 'open,closed', severity: 'P1' };
    expect(stateFromParams('bugs', mergeStateIntoParams('bugs', new URLSearchParams(), state))).toEqual(state);
  });
});

describe('validateStateForKind (strict, on write)', () => {
  test('accepts one filter, the minimum valid view', () => {
    expect(validateStateForKind('bugs', { severity: 'P1' })).toEqual({ ok: true, state: { severity: 'P1' } });
  });

  test('stores the canonical form', () => {
    const result = validateStateForKind('bugs', { severity: 'P2,P1,P1', module: MODULE_ID.toUpperCase() });
    expect(result).toEqual({ ok: true, state: { severity: 'P1,P2', module: MODULE_ID } });
  });

  test('refuses an empty state (nothing to save)', () => {
    expect(validateStateForKind('bugs', {})).toEqual({ ok: false, reason: 'state_empty' });
  });

  test('refuses an unknown key, including one that belongs to another surface', () => {
    expect(validateStateForKind('bugs', { severity: 'P1', outcome: 'failed' })).toEqual({ ok: false, reason: 'state_invalid' });
  });

  test('refuses a list with one invalid item rather than silently trimming it', () => {
    expect(validateStateForKind('bugs', { status: 'open,bogus' })).toEqual({ ok: false, reason: 'state_invalid' });
  });

  test('refuses an invalid date, an invalid uuid and an unknown enum value', () => {
    expect(validateStateForKind('traceability', { from: '2026-02-30' })).toEqual({ ok: false, reason: 'state_invalid' });
    expect(validateStateForKind('traceability', { module: 'abc' })).toEqual({ ok: false, reason: 'state_invalid' });
    expect(validateStateForKind('workbench', { layer: 'Mobile' })).toEqual({ ok: false, reason: 'state_invalid' });
  });

  test('refuses an inverted date range but accepts an open-ended or equal one', () => {
    expect(validateStateForKind('traceability', { from: '2026-09-30', to: '2026-09-01' })).toEqual({ ok: false, reason: 'date_range_inverted' });
    expect(validateStateForKind('traceability', { from: '2026-09-01' }).ok).toBe(true);
    expect(validateStateForKind('traceability', { from: '2026-09-01', to: '2026-09-01' }).ok).toBe(true);
  });

  test.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])('refuses the inherited name "%s" as an unknown key, never throws', (key) => {
    expect(validateStateForKind('bugs', { severity: 'P1', [key]: 'x' })).toEqual({ ok: false, reason: 'state_invalid' });
    expect(validateStateForKind('bugs', JSON.parse(`{"${key}":"x"}`))).toEqual({ ok: false, reason: 'state_invalid' });
  });

  test('refuses an OWN __proto__ key (as JSON.parse creates it) without touching the prototype', () => {
    const hostile = JSON.parse('{"__proto__":"x","severity":"P1"}') as Record<string, string>;
    expect(validateStateForKind('bugs', hostile)).toEqual({ ok: false, reason: 'state_invalid' });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  test('isStateEmpty distinguishes the two cases', () => {
    expect(isStateEmpty({})).toBe(true);
    expect(isStateEmpty({ outcome: 'failed' })).toBe(false);
  });
});
