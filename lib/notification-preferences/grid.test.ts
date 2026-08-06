import { describe, expect, it } from 'bun:test';
import { buildPreferenceGrid } from './grid';

// BK-213 — pure grid-assembly logic (AC1: defaults; AC5: mentions locked).

describe('buildPreferenceGrid', () => {
  it('defaults every editable cell to enabled=true when no rows exist (AC1: "both channels on by default")', () => {
    const grid = buildPreferenceGrid([]);

    const runInApp = grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'in_app')!;
    const runEmail = grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'email')!;
    const bugInApp = grid.find(c => c.event_type === 'bug_lifecycle' && c.channel === 'in_app')!;
    const bugEmail = grid.find(c => c.event_type === 'bug_lifecycle' && c.channel === 'email')!;

    for (const cell of [runInApp, runEmail, bugInApp, bugEmail]) {
      expect(cell.enabled).toBe(true);
      expect(cell.locked).toBe(false);
    }
  });

  it('an existing row overrides the default for that exact cell only (AC2/AC3: channels toggle independently)', () => {
    const grid = buildPreferenceGrid([
      { event_type: 'run_lifecycle', channel: 'in_app', enabled: false },
    ]);

    const runInApp = grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'in_app')!;
    const runEmail = grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'email')!;
    const bugInApp = grid.find(c => c.event_type === 'bug_lifecycle' && c.channel === 'in_app')!;

    expect(runInApp.enabled).toBe(false); // the one cell with a stored row
    expect(runEmail.enabled).toBe(true); // sibling channel, still default
    expect(bugInApp.enabled).toBe(true); // sibling event type, still default
  });

  it('always synthesizes two locked, disabled mentions cells regardless of input rows (AC5)', () => {
    // Even if a `mentions` row were somehow present (it never can be, per
    // migration 0062's INSERT/UPDATE RLS lock), this function must not read
    // it — the locked cells are hardcoded, never DB-sourced.
    const grid = buildPreferenceGrid([
      { event_type: 'mentions', channel: 'in_app', enabled: true },
    ]);

    const mentionsInApp = grid.find(c => c.event_type === 'mentions' && c.channel === 'in_app')!;
    const mentionsEmail = grid.find(c => c.event_type === 'mentions' && c.channel === 'email')!;

    expect(mentionsInApp).toEqual({ event_type: 'mentions', channel: 'in_app', enabled: false, locked: true });
    expect(mentionsEmail).toEqual({ event_type: 'mentions', channel: 'email', enabled: false, locked: true });
  });

  it('returns exactly 6 cells in mockup row order: run lifecycle, bug lifecycle, mentions', () => {
    const grid = buildPreferenceGrid([]);
    expect(grid).toHaveLength(6);
    expect(grid.map(c => c.event_type)).toEqual([
      'run_lifecycle',
      'run_lifecycle',
      'bug_lifecycle',
      'bug_lifecycle',
      'mentions',
      'mentions',
    ]);
  });
});
