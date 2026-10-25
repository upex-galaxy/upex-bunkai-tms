import type { AtcPosition } from './entity-refs';
import { describe, expect, it } from 'bun:test';
import {
  atcExecutionStatus,
  automationStatusOf,
  buildEntityReference,
  distinctRefs,
  entityCode,
  insertAtCaret,
  parseBodySegments,
  pickLatestPosition,
  runStatusOf,
  textWithoutRefs,
} from './entity-refs';

// BK-218 — pure rich-link core.

const ORIGIN = 'https://staging-upexbunkai.vercel.app';
const A = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';

describe('parseBodySegments', () => {
  it('renders ATC, Test and Run references independently and keeps surrounding text', () => {
    const body = `see ${ORIGIN}/projects/pay/atcs/${A} and /projects/pay/tests/${T} then ${ORIGIN}/projects/pay/runs/${R}!`;
    const segs = parseBodySegments(body, [ORIGIN]);
    expect(segs.filter(s => s.kind === 'ref').map(s => s.kind === 'ref' && s.ref.type)).toEqual(['atc', 'test', 'run']);
    expect(textWithoutRefs(segs)).toBe('see and then !');
  });

  it('leaves unsupported entities, foreign hosts and malformed ids as text', () => {
    const body = `https://evil.example/projects/pay/atcs/${A} ${ORIGIN}/projects/pay/bugs/${A} ${ORIGIN}/projects/pay/atcs/not-a-uuid https://example.com/page`;
    const segs = parseBodySegments(body, [ORIGIN]);
    expect(segs).toEqual([{ kind: 'text', text: body }]);
  });

  it('accepts a relative path and is case-insensitive on the id', () => {
    const [seg] = parseBodySegments(`/projects/pay/runs/${R.toUpperCase()}`, [ORIGIN]);
    expect(seg).toMatchObject({ kind: 'ref', ref: { type: 'run', id: R, projectSlug: 'pay' } });
  });

  it('does not match a reference glued to a longer path', () => {
    expect(parseBodySegments(`/projects/pay/runs/${R}/compare`, [ORIGIN]).some(s => s.kind === 'ref')).toBe(false);
  });

  it('round-trips what the picker inserts', () => {
    const url = buildEntityReference({ type: 'test', id: T, projectSlug: 'pay' }, ORIGIN);
    expect(distinctRefs(parseBodySegments(url, [ORIGIN]))).toEqual([{ type: 'test', id: T, projectSlug: 'pay' }]);
  });

  it('dedupes repeated references for resolution', () => {
    const body = `/projects/pay/runs/${R} /projects/pay/runs/${R}`;
    expect(distinctRefs(parseBodySegments(body, []))).toHaveLength(1);
  });
});

describe('status vocabularies', () => {
  it('maps Run-level statuses and never invents blocked', () => {
    expect(['running', 'passed', 'failed', 'aborted'].map(s => runStatusOf(s).label)).toEqual(['Running', 'Passed', 'Failed', 'Aborted']);
  });

  it('maps Test automation statuses', () => {
    expect(['manual-only', 'candidate', 'automated'].map(s => automationStatusOf(s).label)).toEqual(['Manual only', 'Candidate', 'Automated']);
    expect(automationStatusOf('garbage').value).toBe('manual-only');
  });

  const pos = (over: Partial<AtcPosition>): AtcPosition => ({
    runId: 'r1',
    runStartedAt: '2026-10-01T10:00:00Z',
    runStatus: 'passed',
    positionId: 'p1',
    position: 1,
    positionStatus: 'passed',
    ...over,
  });

  it('ATC without a position is unrun', () => {
    expect(atcExecutionStatus(pickLatestPosition([])).value).toBe('unrun');
  });

  it('maps each position state, and running while the Run runs', () => {
    const got = ['pending', 'passed', 'failed', 'blocked', 'skipped'].map(s => atcExecutionStatus(pos({ positionStatus: s })).value);
    expect(got).toEqual(['unrun', 'pass', 'fail', 'blocked', 'skipped']);
    expect(atcExecutionStatus(pos({ runStatus: 'running', positionStatus: 'pending' })).value).toBe('running');
  });

  it('picks latest run by started_at then id, then highest position then id', () => {
    const rows = [
      pos({ runId: 'a', runStartedAt: '2026-10-01T10:00:00Z', positionId: 'x', position: 5 }),
      pos({ runId: 'b', runStartedAt: '2026-10-02T10:00:00Z', positionId: 'p1', position: 1 }),
      pos({ runId: 'b', runStartedAt: '2026-10-02T10:00:00Z', positionId: 'p2', position: 3 }),
      pos({ runId: 'c', runStartedAt: '2026-10-02T10:00:00Z', positionId: 'p3', position: 1 }),
    ];
    expect(pickLatestPosition(rows)?.positionId).toBe('p3');
    expect(pickLatestPosition(rows.filter(r => r.runId !== 'c'))?.positionId).toBe('p2');
    const tie = [pos({ positionId: 'p1', position: 2 }), pos({ positionId: 'p9', position: 2 })];
    expect(pickLatestPosition(tie)?.positionId).toBe('p9');
  });
});

describe('insertAtCaret', () => {
  it('inserts between text without replacing neighbours', () => {
    const r = insertAtCaret('helloworld', 5, 'LINK');
    expect(r.value).toBe('hello LINK world');
    expect(r.value.slice(r.caret)).toBe('world');
  });

  it('adds no extra spaces at clean boundaries', () => {
    expect(insertAtCaret('', 0, 'L').value).toBe('L ');
    expect(insertAtCaret('a ', 2, 'L').value).toBe('a L ');
  });
});

describe('entityCode', () => {
  it('uses the mono short-id idiom', () => {
    expect(entityCode('run', A)).toBe('RUN-11111111');
    expect(entityCode('atc', A)).toStartWith('ATC-');
    expect(entityCode('test', A)).toStartWith('T-');
  });
});
