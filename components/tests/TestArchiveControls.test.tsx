import type { TestArchiveSubject } from './TestArchiveControls';
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

// BK-596 — the archive confirmation and the archived banner, rendered on the
// server (their first paint). This pins what each draws: the Test's name, the
// reversible copy, the Run count, the holding plans (named, never a refusal) and
// the Restore control only for someone who can change the Test. No browser is
// involved, so this is NOT live-UI evidence.

void mock.module('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
const { ArchiveTestDialog, TestArchivedBanner } = await import('./TestArchiveControls');

const BASE: TestArchiveSubject = { id: 't1', title: 'Checkout - guest', version: 4, runCount: 12, plans: [] };
const noop = () => {};

describe('ArchiveTestDialog', () => {
  it('names the Test, says archiving is reversible and that the 12 Runs are kept', () => {
    const html = renderToStaticMarkup(<ArchiveTestDialog test={BASE} onArchived={noop} onCancel={noop} />);
    expect(html).toContain('Checkout - guest');
    expect(html).toContain('Archiving is reversible');
    expect(html).toContain('12 Runs have been recorded. They are kept and stay readable.');
    expect(html).not.toContain('archive-test-plans-warning');
    expect(html).toContain('data-testid="archive-test-confirm"');
  });

  it('states "no Run recorded" for a never-run Test', () => {
    const html = renderToStaticMarkup(<ArchiveTestDialog test={{ ...BASE, runCount: 0 }} onArchived={noop} onCancel={noop} />);
    expect(html).toContain('No Run has been recorded against this Test.');
  });

  it('names the holding plans and still offers the archive', () => {
    const html = renderToStaticMarkup(<ArchiveTestDialog test={{ ...BASE, plans: [{ id: 'p1', name: 'Release 3' }, { id: 'p2', name: 'Smoke' }] }} onArchived={noop} onCancel={noop} />);
    expect(html).toContain('2 Test Plans hold this Test.');
    expect(html).toContain('Release 3');
    expect(html).toContain('Smoke');
    expect(html).toContain('Nothing in them changes.');
    expect(html).not.toMatch(/data-testid="archive-test-confirm"[^>]*disabled/);
  });
});

describe('TestArchivedBanner', () => {
  it('says the Test is read-only and offers Restore to a writer', () => {
    const html = renderToStaticMarkup(<TestArchivedBanner testId="t1" title="Checkout - guest" archivedAt="2026-11-17T10:00:00Z" canRestore />);
    expect(html).toContain('This Test is archived. It is read-only until it is restored.');
    expect(html).toContain('Its Runs stay readable.');
    expect(html).toContain('data-testid="test-detail-restore"');
  });

  it('offers a viewer no Restore', () => {
    const html = renderToStaticMarkup(<TestArchivedBanner testId="t1" title="Checkout - guest" archivedAt="2026-11-17T10:00:00Z" canRestore={false} />);
    expect(html).toContain('data-testid="test-archived-banner"');
    expect(html).not.toContain('data-testid="test-detail-restore"');
  });
});
