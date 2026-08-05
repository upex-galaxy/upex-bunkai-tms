import { computeCountdown } from '@lib/milestones/countdown';
import { describe, expect, test } from 'bun:test';

// BK-205 — the days-remaining chip vocabulary, ratified by the AI Product
// Owner. All comparisons use a fixed `today` so the suite never goes flaky
// with the passage of real time (mirrors the environments/bugs suites'
// relative-offset convention).

const TODAY = '2026-08-15';

describe('computeCountdown', () => {
  test('target date equal to today reads "Due today" (the mockup\'s own string)', () => {
    expect(computeCountdown('2026-08-15', TODAY)).toEqual({
      label: 'Due today',
      tone: 'ontrack',
      daysFromToday: 0,
    });
  });

  test('one day in the future reads "1 day left" (singular)', () => {
    expect(computeCountdown('2026-08-16', TODAY).label).toBe('1 day left');
  });

  test('several days in the future reads "N days left" (plural)', () => {
    expect(computeCountdown('2026-08-20', TODAY).label).toBe('5 days left');
  });

  test('one day in the past reads "1 day past target" (singular) — NOT "Overdue"', () => {
    const result = computeCountdown('2026-08-14', TODAY);
    expect(result.label).toBe('1 day past target');
    expect(result.tone).toBe('neutral-past');
  });

  test('several days in the past reads "N days past target" (plural) — the ratified departure from the mockup\'s "Overdue by N days"', () => {
    const result = computeCountdown('2026-08-10', TODAY);
    expect(result.label).toBe('5 days past target');
    expect(result.tone).toBe('neutral-past');
    expect(result.label).not.toContain('Overdue');
  });

  test('future dates always carry the neutral "ontrack" tone, never an urgency signal', () => {
    expect(computeCountdown('2026-08-16', TODAY).tone).toBe('ontrack');
    expect(computeCountdown('2027-08-16', TODAY).tone).toBe('ontrack');
  });
});
