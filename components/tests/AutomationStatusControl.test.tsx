import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

// BK-227 — the Test header's automation status, rendered on the server (its
// first paint): a dropdown trigger for member+ on a live Test, a bare badge with
// no popup affordance for everyone else. No browser is involved, so this is NOT
// live-UI evidence.

const ROUTER = { refresh: () => {}, push: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER }));
const { AutomationStatusControl } = await import('./AutomationStatusControl');

describe('AutomationStatusControl', () => {
  it('gives member+ a labelled dropdown trigger showing the current status', () => {
    const html = renderToStaticMarkup(<AutomationStatusControl testId="t1" status="candidate" canChange />);
    expect(html).toContain('data-testid="test-automation-status-trigger"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-label="Automation status: Automation candidate. Change status"');
    expect(html).toContain('data-status="blocked"');
  });

  it('gives a viewer the badge alone: no button, no popup, the label still readable (AC 4.1)', () => {
    const html = renderToStaticMarkup(<AutomationStatusControl testId="t1" status="automated" canChange={false} />);
    expect(html).toContain('data-testid="test-automation-status"');
    expect(html).toContain('Automated');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-haspopup');
  });

  it('starts a new Test as Manual-only (AC 1.3)', () => {
    const html = renderToStaticMarkup(<AutomationStatusControl testId="t1" status="manual-only" canChange={false} />);
    expect(html).toContain('Manual-only');
    expect(html).toContain('data-status="skipped"');
  });
});
