import { formatBugListRow, resolveBugListViewState } from '@lib/bugs/list-view';
import { describe, expect, test } from 'bun:test';

describe('resolveBugListViewState', () => {
  test('zero rows resolves to the empty state', () => {
    expect(resolveBugListViewState(0)).toBe('empty');
  });

  test('any row count > 0 resolves to rows', () => {
    expect(resolveBugListViewState(1)).toBe('rows');
    expect(resolveBugListViewState(42)).toBe('rows');
  });
});

describe('formatBugListRow', () => {
  test('formats a run-linked bug with a shortened run link label', () => {
    const row = formatBugListRow({
      id: 'bug-1',
      title: 'Checkout button does nothing',
      severity: 'P1',
      status: 'open',
      module: { path: 'checkout/payment' },
      run_id: '12345678-abcd-ef01-2345-6789abcdef01',
    });
    expect(row.modulePath).toBe('checkout/payment');
    expect(row.runLinkLabel).toBe('Run 12345678');
  });

  test('formats a standalone bug (no run) with a dash run label', () => {
    const row = formatBugListRow({
      id: 'bug-2',
      title: 'Login form rejects valid emails',
      severity: 'P2',
      status: 'open',
      module: { path: 'auth/login' },
      run_id: null,
    });
    expect(row.runLinkLabel).toBe('—');
  });

  test('falls back to a dash module path when module is missing', () => {
    const row = formatBugListRow({
      id: 'bug-3',
      title: 'Some bug',
      severity: 'P3',
      status: 'open',
      module: null,
      run_id: null,
    });
    expect(row.modulePath).toBe('—');
  });
});
