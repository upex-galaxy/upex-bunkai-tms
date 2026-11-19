import type { AutomationStatus } from './automation-status';
import { describe, expect, it } from 'bun:test';
import {
  AUTOMATION_STATUS_LABEL,
  AUTOMATION_STATUS_TONE,
  automationStatusFilterSearch,
  countByAutomationStatus,
  filterTestsByAutomationStatus,
  formatStatusChangeTime,
  isAutomationStatus,
  nextAutomationStatusFilter,
  parseAutomationStatusFilter,
  toAutomationStatus,
} from './automation-status';
import { filterTestsByTag } from './test-list';

// BK-227 — the status filter, counts and timestamps of the Tests list and the
// Test history. Library of the AC: 20 Manual-only, 5 Automation candidate,
// 8 Automated; the tag "regression" on 7 / 2 / 3 of them.

interface Row { id: string, automation_status: AutomationStatus, tags: string[] }

function library(): Row[] {
  const rows: Row[] = [];
  const add = (status: AutomationStatus, total: number, regression: number) => {
    for (let i = 0; i < total; i += 1) {
      rows.push({ id: `${status}-${i}`, automation_status: status, tags: i < regression ? ['regression'] : [] });
    }
  };
  add('manual-only', 20, 7);
  add('candidate', 5, 2);
  add('automated', 8, 3);
  return rows;
}

const regressionIds = (rows: Row[]) => rows.filter(r => r.tags.includes('regression')).map(r => r.id);

describe('values and words', () => {
  it('knows exactly the three statuses and nothing else', () => {
    expect(isAutomationStatus('manual-only')).toBe(true);
    expect(isAutomationStatus('candidate')).toBe(true);
    expect(isAutomationStatus('automated')).toBe(true);
    for (const bad of ['in-progress', 'Automated', 'manual_only', '', null, 3]) {
      expect(isAutomationStatus(bad)).toBe(false);
    }
    expect(toAutomationStatus('weird')).toBe('manual-only');
  });

  it('gives every status a distinct text label and a distinct tone (never color alone)', () => {
    expect(AUTOMATION_STATUS_LABEL).toEqual({ 'manual-only': 'Manual-only', 'candidate': 'Automation candidate', 'automated': 'Automated' });
    expect(new Set(Object.values(AUTOMATION_STATUS_TONE)).size).toBe(3);
  });
});

describe('filter and counts', () => {
  it('lists only the Automated Tests and counts 20 / 5 / 8 (AC 2.1)', () => {
    const rows = library();
    expect(filterTestsByAutomationStatus(rows, 'automated')).toHaveLength(8);
    expect(countByAutomationStatus(rows)).toEqual({ 'manual-only': 20, 'candidate': 5, 'automated': 8 });
  });

  it('lists 20 then 5 for the other two statuses; the counts do not move (AC 2.2)', () => {
    const rows = library();
    expect(filterTestsByAutomationStatus(rows, 'manual-only')).toHaveLength(20);
    expect(filterTestsByAutomationStatus(rows, 'candidate')).toHaveLength(5);
    expect(countByAutomationStatus(rows)).toEqual({ 'manual-only': 20, 'candidate': 5, 'automated': 8 });
  });

  it('is single-select: choosing another status replaces it, the same one clears it', () => {
    expect(nextAutomationStatusFilter(null, 'automated')).toBe('automated');
    expect(nextAutomationStatusFilter('automated', 'manual-only')).toBe('manual-only');
    expect(nextAutomationStatusFilter('manual-only', 'manual-only')).toBeNull();
  });

  it('composes with the tag filter with AND, counts narrowed by the tag only (AC 2.3)', () => {
    const rows = library();
    const tagged = filterTestsByTag(rows, regressionIds(rows));
    expect(countByAutomationStatus(tagged)).toEqual({ 'manual-only': 7, 'candidate': 2, 'automated': 3 });
    const both = filterTestsByAutomationStatus(tagged, 'automated');
    expect(both).toHaveLength(3);
    expect(both.every(r => r.tags.includes('regression') && r.automation_status === 'automated')).toBe(true);
    expect(countByAutomationStatus(tagged)).toEqual({ 'manual-only': 7, 'candidate': 2, 'automated': 3 });
  });

  it('gives an empty list and a zero count for a status nobody has (AC 2.5)', () => {
    const rows = library().filter(r => r.automation_status !== 'candidate');
    expect(filterTestsByAutomationStatus(rows, 'candidate')).toEqual([]);
    expect(countByAutomationStatus(rows).candidate).toBe(0);
    expect(countByAutomationStatus([])).toEqual({ 'manual-only': 0, 'candidate': 0, 'automated': 0 });
  });
});

describe('the address', () => {
  it('reads a known status and ignores anything else', () => {
    expect(parseAutomationStatusFilter(new URLSearchParams('automation=automated'))).toBe('automated');
    expect(parseAutomationStatusFilter(new URLSearchParams('automation=in-progress'))).toBeNull();
    expect(parseAutomationStatusFilter(new URLSearchParams(''))).toBeNull();
  });

  it('sets and clears the parameter, keeping every other one', () => {
    expect(automationStatusFilterSearch('sort=name&dir=asc', 'candidate')).toBe('?sort=name&dir=asc&automation=candidate');
    expect(automationStatusFilterSearch('automation=candidate&sort=name&dir=asc', null)).toBe('?sort=name&dir=asc');
    expect(automationStatusFilterSearch('automation=candidate', null)).toBe('');
  });
});

describe('history timestamps', () => {
  it('renders one instant in each viewer\'s time zone, across a day boundary (AC 3.4)', () => {
    expect(formatStatusChangeTime('2026-07-10T02:30:00Z', 'America/Argentina/Buenos_Aires')).toBe('2026-07-09 23:30');
    expect(formatStatusChangeTime('2026-07-10T02:30:00Z', 'Europe/Berlin')).toBe('2026-07-10 04:30');
    expect(formatStatusChangeTime('2026-07-10T02:30:00Z', 'UTC')).toBe('2026-07-10 02:30');
  });

  it('shows a dash for an unreadable time', () => {
    expect(formatStatusChangeTime('not a date', 'UTC')).toBe('—');
  });
});
