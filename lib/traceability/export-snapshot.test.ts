import type {
  StoryTraceabilityPayload,
  TraceabilityAtc,
  TraceabilityCriterion,
  TraceabilityLatestRun,
} from '@lib/traceability/chain-view';
import {
  buildSnapshotFilename,
  formatSnapshotTimestamp,
  renderTraceabilitySnapshotHtml,
} from '@lib/traceability/export-snapshot';
import { describe, expect, test } from 'bun:test';

function atc(overrides: Partial<TraceabilityAtc> = {}): TraceabilityAtc {
  return {
    id: 'atc-1',
    slug: 'mod/atc-1',
    title: 'An ATC',
    layer: 'UI',
    test: null,
    latest_run: null,
    defects: [],
    ...overrides,
  };
}

function criterion(overrides: Partial<TraceabilityCriterion> = {}): TraceabilityCriterion {
  return { id: 'ac-1', title: 'An AC', atcs: [], ...overrides };
}

function payload(overrides: Partial<StoryTraceabilityPayload> = {}): StoryTraceabilityPayload {
  return {
    story: { id: 'us-1', title: 'A story', status: 'draft', archived_at: null },
    criteria: [],
    ...overrides,
  };
}

function run(overrides: Partial<TraceabilityLatestRun> = {}): TraceabilityLatestRun {
  return {
    run_id: 'run-1',
    run_status: 'passed',
    atc_status: 'passed',
    started_at: '2026-08-01T00:00:00Z',
    finished_at: '2026-08-01T00:05:00Z',
    state: 'passed',
    ...overrides,
  };
}

const IDENTITY = { workspaceName: 'upex-galaxy', projectName: 'bunkai-core' };
const T0 = new Date(2026, 7, 8, 15, 32); // Aug 8, 2026, 15:32 (local — matches the mockup's own stamp shape)

describe('formatSnapshotTimestamp', () => {
  test('renders a human-readable month/day/year/HH:MM stamp', () => {
    expect(formatSnapshotTimestamp(T0)).toBe('Aug 8, 2026, 15:32');
  });

  test('pads single-digit hours and minutes', () => {
    const early = new Date(2026, 0, 1, 3, 5);
    expect(formatSnapshotTimestamp(early)).toBe('Jan 1, 2026, 03:05');
  });
});

describe('buildSnapshotFilename', () => {
  test('slugifies the story title and appends a sortable file stamp with an .html extension (AC1.1)', () => {
    expect(buildSnapshotFilename('Checkout: Apply a Promo Code!', T0)).toBe(
      'trace-checkout-apply-a-promo-code-20260808-1532.html',
    );
  });

  test('falls back to "story" when the title has no filename-safe characters', () => {
    expect(buildSnapshotFilename('★★★', T0)).toBe('trace-story-20260808-1532.html');
  });

  test('truncates very long titles instead of producing an unbounded filename', () => {
    const longTitle = 'a'.repeat(200);
    const filename = buildSnapshotFilename(longTitle, T0);
    expect(filename.length).toBeLessThan(100);
    expect(filename.startsWith('trace-aaaa')).toBe(true);
  });
});

describe('renderTraceabilitySnapshotHtml', () => {
  test('is a self-contained document: doctype, inline <style>, and zero external references (AC1.1)', () => {
    const html = renderTraceabilitySnapshotHtml(payload(), { exportedAt: T0, identity: IDENTITY });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });

  test('zero-ac story renders prose stating no coverage as of the export timestamp, not an empty structure (AC3.1)', () => {
    const html = renderTraceabilitySnapshotHtml(payload({ criteria: [] }), { exportedAt: T0, identity: IDENTITY });
    expect(html).toContain('This story had no coverage as of Aug 8, 2026, 15:32.');
    expect(html).not.toContain('<table');
  });

  test('zero-coverage story (ACs exist, no ATCs bound) renders the uncovered banner and per-AC strip', () => {
    const html = renderTraceabilitySnapshotHtml(
      payload({ criteria: [criterion({ title: 'Log in' }), criterion({ id: 'ac-2', title: 'Log out' })] }),
      { exportedAt: T0, identity: IDENTITY },
    );
    expect(html).toContain('No coverage anywhere on this story.');
    expect(html).toContain('Log in');
    expect(html).toContain('Log out');
    expect(html).toContain('Uncovered');
  });

  test('has-chain story renders every AC/ATC/test/run/defect field the screen shows (AC1.1)', () => {
    const populated = payload({
      story: { id: 'us-1', title: 'Checkout flow', status: 'ready_to_test', archived_at: null },
      criteria: [
        criterion({
          title: 'Applies a discount code',
          atcs: [
            atc({
              slug: 'checkout/apply-promo',
              title: 'Apply a valid promo code',
              layer: 'API',
              test: { id: 'test-1', title: 'Promo code test' },
              latest_run: run({ state: 'failed' }),
              defects: [
                { id: 'def-1', title: 'Discount not applied', severity: 'P2', status: 'open', created_at: '2026-08-01T00:00:00Z', run_id: 'run-1', run_step_id: null },
              ],
            }),
          ],
        }),
      ],
    });
    const html = renderTraceabilitySnapshotHtml(populated, { exportedAt: T0, identity: IDENTITY });
    expect(html).toContain('Checkout flow');
    expect(html).toContain('Applies a discount code');
    expect(html).toContain('checkout/apply-promo');
    expect(html).toContain('Apply a valid promo code');
    expect(html).toContain('Promo code test');
    expect(html).toContain('Fail');
    expect(html).toContain('Discount not applied (open)');
    expect(html).toContain('1 ACs · 1 ATCs · 1 tests · 1 runs · 1 defects');
  });

  test('escapes user-authored content to prevent HTML injection into the exported document', () => {
    const malicious = payload({
      story: { id: 'us-1', title: '<script>alert(1)</script>', status: 'draft', archived_at: null },
    });
    const html = renderTraceabilitySnapshotHtml(malicious, { exportedAt: T0, identity: IDENTITY });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('archived story carries an archived banner (mirrors the on-screen archived banner)', () => {
    const archived = payload({
      story: { id: 'us-1', title: 'Old story', status: 'draft', archived_at: '2026-07-01T00:00:00Z' },
    });
    const html = renderTraceabilitySnapshotHtml(archived, { exportedAt: T0, identity: IDENTITY });
    expect(html).toContain('This story was archived');
  });

  test('carries the workspace/project identity and export timestamp (PO ruling §4)', () => {
    const html = renderTraceabilitySnapshotHtml(payload(), { exportedAt: T0, identity: IDENTITY });
    expect(html).toContain('upex-galaxy / bunkai-core');
    expect(html).toContain('Exported Aug 8, 2026, 15:32');
  });
});
