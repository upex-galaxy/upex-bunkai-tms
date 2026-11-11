import type { BulkEditReport, BulkOutcome } from '@lib/atcs/bulk-edit';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-507 — the confirmation and outcome report, rendered in happy-dom (the
// ArchiveAtcDialog.test.ts setup). The endpoint is a fetch double; what the
// database does is proven in lib/atcs/bulk-edit-isolation.test.ts. This is not
// live-UI evidence: no browser runs here.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toasts: string[] = [];
void mock.module('sonner', () => ({
  toast: { success: (message: string) => { toasts.push(message); }, error: () => {} },
}));
let revalidations = 0;
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterAtcBulkEdit: async () => { revalidations += 1; },
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AtcBulkEditDialog, BULK_KEPT_COPY, BULK_UNKNOWN_COPY } = await import('@components/atcs/AtcBulkEditDialog');

function outcome(id: string, kind: BulkOutcome['outcome'], reason: string | null = null): BulkOutcome {
  return { atc_id: id, slug: `m/atc-${id}`, title: `ATC ${id}`, outcome: kind, reason, version: 2 };
}

function report(outcomes: BulkOutcome[], dryRun: boolean): BulkEditReport {
  return {
    dry_run: dryRun,
    field: 'layer',
    requested: outcomes.length,
    changed: outcomes.filter(o => o.outcome === 'changed').length,
    unchanged: outcomes.filter(o => o.outcome === 'unchanged').length,
    refused: outcomes.filter(o => o.outcome === 'refused').length,
    outcomes,
  };
}

const ITEMS = [{ id: '1', version: 1 }, { id: '2', version: 1 }, { id: '3', version: 1 }, { id: '4', version: 1 }];
const CHANGE = { field: 'layer', layer: 'API' } as const;

const realFetch = globalThis.fetch;
let bodies: Array<Record<string, unknown>> = [];
let respond: (body: Record<string, unknown>) => Response | Promise<Response> = () => new Response('{}');
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let finished: Array<BulkEditReport | null> = [];
let cancelled = 0;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function render(props: { hiddenCount?: number } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(AtcBulkEditDialog, {
      projectId: 'p1',
      items: ITEMS,
      change: CHANGE,
      hiddenCount: props.hiddenCount ?? 0,
      onFinished: (r: BulkEditReport | null) => { finished.push(r); },
      onCancel: () => { cancelled += 1; },
    }));
  });
  mounted.push({ container, root });
  await flush();
  return container;
}

function byId(container: HTMLElement, id: string) {
  return container.querySelector(`[data-testid="${id}"]`);
}

function click(el: Element | null) {
  if (!el) { throw new Error('element not found'); }
  act(() => { (el as HTMLElement).click(); });
}

const PREVIEW = report([outcome('1', 'changed'), outcome('2', 'changed'), outcome('3', 'unchanged'), outcome('4', 'refused', 'stale_version')], true);
const APPLIED = report([outcome('1', 'changed'), outcome('2', 'changed'), outcome('3', 'unchanged'), outcome('4', 'refused', 'stale_version')], false);

beforeEach(() => {
  bodies = [];
  toasts.length = 0;
  finished = [];
  cancelled = 0;
  revalidations = 0;
  respond = body => json(body.dry_run ? PREVIEW : APPLIED);
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

describe('the confirmation names the change and previews before writing', () => {
  test('states the exact change and ATC count, previews with dry_run, and has written nothing yet', async () => {
    const dialog = await render();
    expect(byId(dialog, 'atc-bulk-change')?.textContent).toBe('Set layer to API');
    expect(byId(dialog, 'atc-bulk-count')?.textContent).toBe('4 ATCs');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].dry_run).toBe(true);
    expect(byId(dialog, 'atc-bulk-n-changed')?.textContent).toBe('2 will change');
    expect(byId(dialog, 'atc-bulk-n-unchanged')?.textContent).toContain('already as requested');
    expect(byId(dialog, 'atc-bulk-n-refused')?.textContent).toBe('1 will be refused');
    expect(byId(dialog, 'atc-bulk-refusal-stale_version')?.textContent).toContain('ATC 4');
    expect(byId(dialog, 'atc-bulk-apply')?.textContent).toBe('Apply to 2 ATCs');
  });

  test('names the selected ATCs the filters hide (E6)', async () => {
    const dialog = await render({ hiddenCount: 3 });
    expect(byId(dialog, 'atc-bulk-dialog-hidden')?.textContent).toContain('3 of them are hidden');
  });

  test('Apply is disabled when the preview finds nothing to change', async () => {
    respond = () => json(report([outcome('1', 'unchanged')], true));
    const dialog = await render();
    expect((byId(dialog, 'atc-bulk-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(byId(dialog, 'atc-bulk-nothing')).not.toBeNull();
  });

  test('a failed preview writes nothing and offers no Apply', async () => {
    respond = () => json({ error: { message: 'Selection too large.' } }, 422);
    const dialog = await render();
    expect(byId(dialog, 'atc-bulk-preview-failed')?.textContent).toContain('Nothing changed.');
    expect((byId(dialog, 'atc-bulk-apply') as HTMLButtonElement).disabled).toBe(true);
    expect(bodies.filter(b => b.dry_run === false)).toHaveLength(0);
  });
});

describe('applying', () => {
  test('a partial failure keeps the report on screen, says nothing was rolled back, and hands the report back on Done', async () => {
    const dialog = await render();
    click(byId(dialog, 'atc-bulk-apply'));
    await flush();
    expect(bodies.filter(b => b.dry_run === false)).toHaveLength(1);
    expect(byId(dialog, 'atc-bulk-n-changed')?.textContent).toBe('2 changed');
    expect(byId(dialog, 'atc-bulk-n-refused')?.textContent).toBe('1 not changed');
    expect(byId(dialog, 'atc-bulk-refusals')?.textContent).toContain(BULK_KEPT_COPY);
    expect(finished).toHaveLength(0);
    expect(revalidations).toBe(1);

    click(byId(dialog, 'atc-bulk-done'));
    expect(finished).toHaveLength(1);
    expect(finished[0]?.refused).toBe(1);
  });

  test('a clean result toasts and closes at once', async () => {
    respond = body => json(body.dry_run
      ? report([outcome('1', 'changed')], true)
      : report([outcome('1', 'changed'), outcome('2', 'unchanged')], false));
    const dialog = await render();
    click(byId(dialog, 'atc-bulk-apply'));
    await flush();
    expect(toasts).toEqual(['Changed 1 ATC.']);
    expect(finished).toHaveLength(1);
  });

  test('E4: a double confirm is ONE write', async () => {
    const dialog = await render();
    const apply = byId(dialog, 'atc-bulk-apply');
    click(apply);
    click(apply);
    await flush();
    expect(bodies.filter(b => b.dry_run === false)).toHaveLength(1);
  });

  test('E10: a server rejection says nothing changed, keeps the dialog, and can retry', async () => {
    respond = body => (body.dry_run ? json(PREVIEW) : json({ error: { message: 'Database unavailable.' } }, 500));
    const dialog = await render();
    click(byId(dialog, 'atc-bulk-apply'));
    await flush();
    expect(byId(dialog, 'atc-bulk-failed')?.textContent).toContain('Nothing changed.');
    expect(byId(dialog, 'atc-bulk-failed')?.textContent).toContain('Database unavailable.');
    expect(finished).toHaveLength(0);

    respond = body => json(body.dry_run ? PREVIEW : APPLIED);
    click(byId(dialog, 'atc-bulk-retry'));
    await flush();
    expect(bodies.filter(b => b.dry_run === false)).toHaveLength(2);
    expect(byId(dialog, 'atc-bulk-done')).not.toBeNull();
  });

  test('a lost answer never claims "nothing changed": it says the result is unknown and refreshes', async () => {
    respond = (body) => {
      if (body.dry_run) { return json(PREVIEW); }
      throw new TypeError('network down');
    };
    const dialog = await render();
    click(byId(dialog, 'atc-bulk-apply'));
    await flush();
    expect(byId(dialog, 'atc-bulk-unknown')?.textContent).toBe(BULK_UNKNOWN_COPY);
    expect(byId(dialog, 'atc-bulk-failed')?.textContent).not.toContain('Nothing changed.');
    expect(revalidations).toBe(1);

    click(byId(dialog, 'atc-bulk-refresh'));
    expect(finished).toEqual([null]);
  });

  test('E5: the browser is asked before leaving while the write runs, and not before or after', async () => {
    let release: (r: Response) => void = () => {};
    respond = async (body) => {
      if (body.dry_run) { return json(PREVIEW); }
      return new Promise<Response>((resolve) => { release = resolve; });
    };
    const dialog = await render();
    const probe = () => {
      const event = new window.Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(probe()).toBe(false);
    click(byId(dialog, 'atc-bulk-apply'));
    await flush();
    expect(probe()).toBe(true);
    expect((byId(dialog, 'atc-bulk-cancel') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { release(json(APPLIED)); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(probe()).toBe(false);
  });

  test('Cancel closes without writing', async () => {
    const dialog = await render();
    click(byId(dialog, 'atc-bulk-cancel'));
    expect(cancelled).toBe(1);
    expect(bodies.filter(b => b.dry_run === false)).toHaveLength(0);
  });
});
