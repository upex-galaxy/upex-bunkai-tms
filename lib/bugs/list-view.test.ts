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

  test('resolves every severity to its label + chip token, matching the mockup\'s own tone mapping', () => {
    const bug = (severity: string) => formatBugListRow({
      id: 'bug',
      title: 'title',
      severity,
      status: 'open',
      module: null,
      run_id: null,
    });
    expect(bug('P1')).toMatchObject({ severityLabel: 'Critical', severityToken: 'fail' });
    expect(bug('P2')).toMatchObject({ severityLabel: 'Major', severityToken: 'blocked' });
    expect(bug('P3')).toMatchObject({ severityLabel: 'Minor', severityToken: 'running' });
    expect(bug('P4')).toMatchObject({ severityLabel: 'Trivial', severityToken: 'skipped' });
  });

  test('resolves every status to its label + chip token, matching the mockup\'s own tone mapping', () => {
    const bug = (status: string) => formatBugListRow({
      id: 'bug',
      title: 'title',
      severity: 'P3',
      status,
      module: null,
      run_id: null,
    });
    expect(bug('open')).toMatchObject({ statusLabel: 'Open', statusToken: 'fail' });
    expect(bug('in_progress')).toMatchObject({ statusLabel: 'In progress', statusToken: 'running' });
    expect(bug('resolved')).toMatchObject({ statusLabel: 'Resolved', statusToken: 'pass' });
    expect(bug('closed')).toMatchObject({ statusLabel: 'Closed', statusToken: 'skipped' });
  });
});
