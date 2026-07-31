import { formatExpiryCell, formatExpiryChoiceDate, formatWorkspaceCell } from '@lib/tokens/format';
import { describe, expect, test } from 'bun:test';

// BK-88 Slice A/B — token list + issuance-form display formatting (PO/UX Decision 3).

describe('formatExpiryCell', () => {
  const now = new Date('2026-08-01T00:00:00.000Z');

  test('null expiry -> "never", not expiring soon', () => {
    expect(formatExpiryCell(null, now)).toEqual({ label: 'never', isExpiringSoon: false, daysUntilExpiry: null });
  });

  test('boundary: exactly 7 days out -> expiring soon', () => {
    const expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const result = formatExpiryCell(expiresAt, now);
    expect(result.isExpiringSoon).toBe(true);
    expect(result.daysUntilExpiry).toBe(7);
  });

  test('boundary: 8 days out -> not expiring soon', () => {
    const expiresAt = new Date(now.getTime() + 8 * 86_400_000).toISOString();
    const result = formatExpiryCell(expiresAt, now);
    expect(result.isExpiringSoon).toBe(false);
    expect(result.daysUntilExpiry).toBe(8);
  });

  test('mockup fixture: 2 days out -> expiring soon', () => {
    const expiresAt = new Date(now.getTime() + 2 * 86_400_000).toISOString();
    const result = formatExpiryCell(expiresAt, now);
    expect(result.isExpiringSoon).toBe(true);
    expect(result.daysUntilExpiry).toBe(2);
  });

  test('past-dated expiry still renders the date, no special-casing beyond that', () => {
    const expiresAt = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const result = formatExpiryCell(expiresAt, now);
    expect(result.label).toBe(expiresAt.slice(0, 10));
    expect(result.isExpiringSoon).toBe(false);
  });

  test('label renders as an ISO date (YYYY-MM-DD)', () => {
    const expiresAt = '2026-09-10T00:00:00.000Z';
    expect(formatExpiryCell(expiresAt, now).label).toBe('2026-09-10');
  });
});

describe('formatWorkspaceCell', () => {
  test('null workspace -> "All workspaces", no sub-label', () => {
    expect(formatWorkspaceCell(null, null)).toEqual({ label: 'All workspaces', subLabel: null });
  });

  test('workspace id + label -> label with the id as sub-label', () => {
    expect(formatWorkspaceCell('ws-1', 'UPEX Core')).toEqual({ label: 'UPEX Core', subLabel: 'ws-1' });
  });

  test('workspace id with no resolved label falls back to the id itself', () => {
    expect(formatWorkspaceCell('ws-missing', null)).toEqual({ label: 'ws-missing', subLabel: 'ws-missing' });
  });
});

describe('formatExpiryChoiceDate', () => {
  // Mockup fixture date (settings-tokens.html:1043-1046) -- "today" there is
  // 2026-07-30, and the three fixed choices resolve to the exact dates shown
  // next to each <option>.
  const now = new Date('2026-07-30T00:00:00.000Z');

  test('30 days from now', () => {
    expect(formatExpiryChoiceDate(30, now)).toBe('2026-08-29');
  });

  test('90 days from now', () => {
    expect(formatExpiryChoiceDate(90, now)).toBe('2026-10-28');
  });

  test('365 days from now', () => {
    expect(formatExpiryChoiceDate(365, now)).toBe('2027-07-30');
  });
});
