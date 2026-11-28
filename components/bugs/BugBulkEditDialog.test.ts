import type { BugBulkChange, BugBulkEditReport, BugBulkOutcome } from '@lib/bugs/bulk-edit';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';

// BK-2098 AC21 to AC23 — the confirmation and the outcome report in happy-dom.
// The endpoint is a fetch double; this is not live-UI evidence.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { BUG_BULK_CLOSE_COPY, BUG_BULK_REJECTED_COPY, BUG_BULK_UNKNOWN_COPY, BugBulkEditDialog } = await import('@components/bugs/BugBulkEditDialog');

function outcome(id: string, kind: BugBulkOutcome['outcome'], reason: string | null = null): BugBulkOutcome {
  return { bug_id: id, title: `Bug ${id}`, outcome: kind, reason, status: 'resolved', severity: 'P3', version: 1 };
}

function report(outcomes: BugBulkOutcome[], dryRun: boolean): BugBulkEditReport {
  return {
    dry_run: dryRun,
    field: 'status',
    requested: outcomes.length,
    changed: outcomes.filter(o => o.outcome === 'changed').length,
    unchanged: outcomes.filter(o => o.outcome === 'unchanged').length,
    refused: outcomes.filter(o => o.outcome === 'refused').length,
    outcomes,
  };
}

const ITEMS = [{ id: '1', version: 1 }, { id: '2', version: 1 }, { id: '3', version: 1 }];
const MIXED = [outcome('1', 'changed'), outcome('2', 'unchanged'), outcome('3', 'refused', 'status_transition_skipped')];

const realFetch = globalThis.fetch;
let bodies: Array<Record<string, unknown>> = [];
let respond: (body: Record<string, unknown>) => Response | Promise<Response> = () => new Response('{}');
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let written: BugBulkEditReport[] = [];
let unknowns = 0;
let closed = 0;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function render(change: BugBulkChange = { field: 'status', status: 'resolved' }, hiddenCount = 0) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(BugBulkEditDialog, {
      projectId: 'p1',
      items: ITEMS,
      change,
      hiddenCount,
      onWritten: (r: BugBulkEditReport) => { written.push(r); },
      onUnknown: () => { unknowns += 1; },
      onClose: () => { closed += 1; },
    }));
  });
  mounted.push({ container, root });
  await flush();
  return container;
}

function byId(container: HTMLElement, id: string) {
  return container.querySelector(`[data-testid="${id}"]`);
}

async function click(el: Element | null) {
  if (!el) { throw new Error('element not found'); }
  act(() => { (el as HTMLElement).click(); });
  await flush();
}

beforeEach(() => {
  bodies = [];
  written = [];
  unknowns = 0;
  closed = 0;
  respond = body => json(report(MIXED, body.dry_run as boolean));
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    return respond(body);
  }) as typeof fetch;
});

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  globalThis.fetch = realFetch;
});

describe('aC21: the confirmation previews before writing', () => {
  test('names the change, the counts and each refusal reason, and has written nothing', async () => {
    const dialog = await render(undefined, 2);
    expect(byId(dialog, 'bugs-bulk-change')?.textContent).toBe('Set status to Resolved');
    expect(byId(dialog, 'bugs-bulk-count')?.textContent).toBe('3 Bugs');
    expect(byId(dialog, 'bugs-bulk-dialog-hidden')?.textContent).toContain('2 of them are not shown');
    expect(bodies.map(b => b.dry_run)).toEqual([true]);
    expect(byId(dialog, 'bugs-bulk-n-changed')?.textContent).toBe('1 will change');
    expect(byId(dialog, 'bugs-bulk-n-unchanged')?.textContent).toContain('already set');
    expect(byId(dialog, 'bugs-bulk-refusal-status_transition_skipped')?.textContent).toContain('Bug 3');
    expect(byId(dialog, 'bugs-bulk-apply')?.textContent).toBe('Apply to 1 Bug');
    expect(byId(dialog, 'bugs-bulk-close-warning')).toBeNull();
  });

  test('closing says it cannot be undone', async () => {
    const dialog = await render({ field: 'status', status: 'closed' });
    expect(byId(dialog, 'bugs-bulk-close-warning')?.textContent).toBe(BUG_BULK_CLOSE_COPY);
  });

  test('apply is disabled when nothing would change', async () => {
    respond = body => json(report([outcome('1', 'unchanged'), outcome('2', 'refused', 'status_transition_backward')], body.dry_run as boolean));
    const dialog = await render();
    expect((byId(dialog, 'bugs-bulk-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(byId(dialog, 'bugs-bulk-nothing')).not.toBeNull();
  });
});

describe('aC22: the outcome report', () => {
  test('apply writes once, reports in the dialog and hands the report to the list', async () => {
    const dialog = await render();
    const apply = byId(dialog, 'bugs-bulk-apply');
    await click(apply);
    expect(bodies.map(b => b.dry_run)).toEqual([true, false]);
    expect(written).toHaveLength(1);
    expect(byId(dialog, 'bugs-bulk-n-changed')?.textContent).toBe('1 changed');
    expect(byId(dialog, 'bugs-bulk-n-refused')?.textContent).toBe('1 refused');
    expect(byId(dialog, 'bugs-bulk-refusals')?.textContent).toContain('one stage at a time');
    await click(byId(dialog, 'bugs-bulk-done'));
    expect(closed).toBe(1);
  });

  test('a double confirm sends one write, and Cancel is disabled while writing', async () => {
    let release: () => void = () => {};
    respond = async body => body.dry_run
      ? json(report(MIXED, true))
      : new Promise<Response>((resolve) => { release = () => resolve(json(report(MIXED, false))); });
    const dialog = await render();
    const apply = byId(dialog, 'bugs-bulk-apply') as HTMLButtonElement;
    act(() => { apply.click(); apply.click(); });
    await flush();
    expect((byId(dialog, 'bugs-bulk-cancel') as HTMLButtonElement).disabled).toBe(true);
    expect(bodies.filter(b => b.dry_run === false)).toHaveLength(1);
    release();
    await flush();
    expect(written).toHaveLength(1);
  });
});

describe('aC23: a failed or unanswered request', () => {
  test('a rejection shows the server message and says nothing was changed', async () => {
    respond = body => body.dry_run ? json(report(MIXED, true)) : json({ error: { code: 'project_read_only', message: 'This project is read-only.' } }, 422);
    const dialog = await render();
    await click(byId(dialog, 'bugs-bulk-apply'));
    expect(byId(dialog, 'bugs-bulk-failed')?.textContent).toContain(BUG_BULK_REJECTED_COPY);
    expect(byId(dialog, 'bugs-bulk-server-message')?.textContent).toBe('This project is read-only.');
    expect(written).toHaveLength(0);
    expect(unknowns).toBe(0);
  });

  test('no answer says the result could not be confirmed and asks the list to reload', async () => {
    respond = (body) => {
      if (body.dry_run) { return json(report(MIXED, true)); }
      throw new TypeError('network');
    };
    const dialog = await render();
    await click(byId(dialog, 'bugs-bulk-apply'));
    expect(byId(dialog, 'bugs-bulk-unknown')?.textContent).toBe(BUG_BULK_UNKNOWN_COPY);
    expect(unknowns).toBe(1);
    expect(written).toHaveLength(0);
  });
});
