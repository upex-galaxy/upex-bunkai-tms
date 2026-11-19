import type { AutomationStatusEntry } from '@lib/tests/automation-status';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestAutomationHistory } from './TestAutomationHistory';

// BK-227 — the Status history tab, rendered on the server (its first paint).
// The order comes from the reader (newest first); this pins what each entry
// shows, the empty state and that nothing offers an edit or a delete. The
// first paint states UTC; the browser swaps in the viewer's time zone. Not
// live-UI evidence.

const ENTRIES: AutomationStatusEntry[] = [
  { id: 'e2', from_status: 'candidate', to_status: 'automated', actor_user_id: 'u2', actor_name: 'Mateo', changed_at: '2026-07-10T02:30:00Z' },
  { id: 'e1', from_status: 'manual-only', to_status: 'candidate', actor_user_id: null, actor_name: 'Elena', changed_at: '2026-07-01T12:00:00Z' },
];

describe('TestAutomationHistory', () => {
  it('shows an empty history with the current status for a never-changed Test (AC 1.3)', () => {
    const html = renderToStaticMarkup(<TestAutomationHistory status="manual-only" history={[]} />);
    expect(html).toContain('data-testid="test-automation-history-empty"');
    expect(html).toContain('No status changes yet');
    expect(html).toContain('This Test is Manual-only.');
  });

  it('lists each change with author, from, to and time, in the order given (AC 3.1)', () => {
    const html = renderToStaticMarkup(<TestAutomationHistory status="automated" history={ENTRIES} />);
    const mateo = html.indexOf('test-automation-history-entry-e2');
    const elena = html.indexOf('test-automation-history-entry-e1');
    expect(mateo).toBeGreaterThan(-1);
    expect(elena).toBeGreaterThan(mateo);
    expect(html).toContain('Mateo');
    expect(html).toContain('Elena');
    expect(html).toContain('dateTime="2026-07-10T02:30:00Z"');
    expect(html).toContain('2026-07-10 02:30 UTC');
    expect(html).toMatch(/test-automation-history-entry-e2.*?Automation candidate.*?Automated/);
  });

  it('keeps the author name of an entry whose account is gone (E3)', () => {
    const html = renderToStaticMarkup(<TestAutomationHistory status="automated" history={ENTRIES} />);
    expect(html).toMatch(/test-automation-history-entry-e1.*?Elena/);
  });

  it('offers no control to edit or delete an entry (AC 3.2)', () => {
    const html = renderToStaticMarkup(<TestAutomationHistory status="automated" history={ENTRIES} />);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
  });
});
