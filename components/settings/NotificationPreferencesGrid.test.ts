import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

// BK-1218 — on Settings > Notifications, two quick toggles where the first
// save failed reverted BOTH cells: the failure path restored a whole-grid
// snapshot taken at the first click, wiping the second cell that the server
// had already saved. The single `savingKey` made it worse: clicking cell B
// re-enabled cell A while A's save was still in flight (a second, overlapping
// save of A), and A settling re-enabled B mid-save.
//
// Rendered with happy-dom like BillingOverviewView.test.ts (DOM registered in
// this file, React imported dynamically after it). Every PATCH hangs until
// the test settles it, so the order "first fails after the second succeeded"
// is chosen, not raced. `toast` is spied, never `mock.module`d: that mock is
// process-wide and would bleed into the other React suites.
GlobalRegistrator.register();
// Release the DOM when this file is done, so another React suite in the same
// `bun test` process can register its own.
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { toast } = await import('sonner');
const { buildPreferenceGrid } = await import('@lib/notification-preferences/grid');
const { NotificationPreferencesGrid } = await import('@components/settings/NotificationPreferencesGrid');

interface PatchBody {
  event_type: string
  channel: string
  enabled: boolean
}

interface PendingPatch {
  body: PatchBody
  resolve: (value: Response) => void
  reject: (reason: unknown) => void
}

const realSetTimeout = globalThis.setTimeout;
const realFetch = globalThis.fetch;

let pendingPatches: PendingPatch[] = [];
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let toastError: ReturnType<typeof spyOn>;
let toastSuccess: ReturnType<typeof spyOn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); });
  });
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // No stored rows: the four editable cells start on their default, On.
  act(() => { root.render(createElement(NotificationPreferencesGrid, { preferences: buildPreferenceGrid([]) })); });
  mounted.push({ container, root });
  return container;
}

function toggleOf(container: HTMLElement, eventType: string, channel: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="pref-cell-${eventType}-${channel}"] button[role="switch"]`);
  if (!button) {
    throw new Error(`no toggle for ${eventType}/${channel}`);
  }
  return button;
}

function isOn(container: HTMLElement, eventType: string, channel: string): boolean {
  return toggleOf(container, eventType, channel).getAttribute('aria-checked') === 'true';
}

async function click(container: HTMLElement, eventType: string, channel: string): Promise<void> {
  await act(async () => { toggleOf(container, eventType, channel).click(); });
}

function patchesFor(eventType: string, channel: string): PendingPatch[] {
  return pendingPatches.filter(patch => patch.body.event_type === eventType && patch.body.channel === channel);
}

async function succeed(patch: PendingPatch): Promise<void> {
  await act(async () => {
    patch.resolve(jsonResponse({ preference: { ...patch.body, updated_at: '2026-10-28T00:00:00Z' } }));
  });
  await flush();
}

async function failWith500(patch: PendingPatch): Promise<void> {
  await act(async () => {
    patch.resolve(jsonResponse({ error: { code: 'internal_error', message: 'Could not save this preference.' } }, 500));
  });
  await flush();
}

beforeEach(() => {
  pendingPatches = [];
  mounted = [];
  toastError = spyOn(toast, 'error');
  toastSuccess = spyOn(toast, 'success');
  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    return new Promise<Response>((resolve, reject) => {
      pendingPatches.push({ body: JSON.parse(init?.body ?? '{}') as PatchBody, resolve, reject });
    });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  toastError.mockRestore();
  toastSuccess.mockRestore();
  globalThis.fetch = realFetch;
});

describe('NotificationPreferencesGrid — per-cell saves (BK-1218)', () => {
  test('two cells toggled quickly, the first save fails after the second succeeded: only the first reverts', async () => {
    const container = mount();

    await click(container, 'run_lifecycle', 'email');
    await click(container, 'bug_lifecycle', 'in_app');
    expect(isOn(container, 'run_lifecycle', 'email')).toBe(false);
    expect(isOn(container, 'bug_lifecycle', 'in_app')).toBe(false);

    await succeed(patchesFor('bug_lifecycle', 'in_app')[0]);
    await failWith500(patchesFor('run_lifecycle', 'email')[0]);

    // The failed cell is back to what the server holds, with the error toast.
    expect(isOn(container, 'run_lifecycle', 'email')).toBe(true);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('Could not save this preference.');
    // The other cell keeps the value the server saved (the reported defect
    // showed it On again while the DB held Off).
    expect(isOn(container, 'bug_lifecycle', 'in_app')).toBe(false);
    // Untouched cells are untouched.
    expect(isOn(container, 'run_lifecycle', 'in_app')).toBe(true);
    expect(isOn(container, 'bug_lifecycle', 'email')).toBe(true);
  });

  test('the first save fails on a network error before the second succeeds: the second cell still shows its saved value', async () => {
    const container = mount();

    await click(container, 'run_lifecycle', 'email');
    await click(container, 'bug_lifecycle', 'in_app');

    await act(async () => { patchesFor('run_lifecycle', 'email')[0].reject(new TypeError('Failed to fetch')); });
    await flush();
    expect(isOn(container, 'run_lifecycle', 'email')).toBe(true);
    expect(isOn(container, 'bug_lifecycle', 'in_app')).toBe(false);
    expect(toastError).toHaveBeenCalledWith('Failed to fetch');

    await succeed(patchesFor('bug_lifecycle', 'in_app')[0]);
    expect(isOn(container, 'bug_lifecycle', 'in_app')).toBe(false);
    expect(isOn(container, 'run_lifecycle', 'email')).toBe(true);
  });

  // Same-cell overlap is closed rather than reconciled: the PATCH is an
  // unversioned last-write-wins upsert, so two in-flight saves of one cell can
  // commit in either order and no client-side ordering rule can match the DB.
  test('a cell cannot be saved again while its own save is in flight, even after another cell is toggled', async () => {
    const container = mount();

    await click(container, 'run_lifecycle', 'email');
    await click(container, 'bug_lifecycle', 'in_app');

    expect(toggleOf(container, 'run_lifecycle', 'email').disabled).toBe(true);
    await click(container, 'run_lifecycle', 'email');

    expect(patchesFor('run_lifecycle', 'email')).toHaveLength(1);
    expect(isOn(container, 'run_lifecycle', 'email')).toBe(false);
  });

  test('one cell settling does not re-enable another cell whose save is still in flight', async () => {
    const container = mount();

    await click(container, 'run_lifecycle', 'email');
    await click(container, 'bug_lifecycle', 'in_app');
    await succeed(patchesFor('run_lifecycle', 'email')[0]);

    expect(toggleOf(container, 'run_lifecycle', 'email').disabled).toBe(false);
    expect(toggleOf(container, 'bug_lifecycle', 'in_app').disabled).toBe(true);
    await click(container, 'bug_lifecycle', 'in_app');
    expect(patchesFor('bug_lifecycle', 'in_app')).toHaveLength(1);
  });

  test('a cell can be toggled again once its save has settled', async () => {
    const container = mount();

    await click(container, 'run_lifecycle', 'in_app');
    await succeed(patchesFor('run_lifecycle', 'in_app')[0]);
    expect(isOn(container, 'run_lifecycle', 'in_app')).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith('Saved');

    await click(container, 'run_lifecycle', 'in_app');
    const patches = patchesFor('run_lifecycle', 'in_app');
    expect(patches).toHaveLength(2);
    expect(patches[1].body.enabled).toBe(true);
    await succeed(patches[1]);
    expect(isOn(container, 'run_lifecycle', 'in_app')).toBe(true);
  });
});
