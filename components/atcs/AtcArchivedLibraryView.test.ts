import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-571 — the archived view's restore states, rendered in happy-dom (the
// ArchiveAtcDialog.test.ts setup). The endpoint is a fetch double; what the
// database does with restore is proven in lib/atcs/archive-restore-isolation.test.ts.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let refreshes = 0;
// One stable router, like Next's: a fresh object per render loops any component
// that lists the router in a hook's deps (see ArchiveAtcDialog.test.ts).
const router = { push: () => {}, refresh: () => { refreshes += 1; } };
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));
const toasts: string[] = [];
void mock.module('sonner', () => ({
  toast: { success: (message: string) => { toasts.push(message); }, error: () => {} },
}));
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterArchiveChange: async () => {},
}));

const { act, createElement } = await import('react');
void mock.module('next/link', () => ({
  default: ({ children, href, ...rest }: { children: never, href: string }) => createElement('a', { href, ...rest }, children),
}));

const { createRoot } = await import('react-dom/client');
const { AtcArchivedLibraryView } = await import('@components/atcs/AtcArchivedLibraryView');

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'mod/atc-1a2b3c4d',
  code: 'atc-1a2b3c4d',
  title: 'Login with expired token',
  layer: 'UI',
  projectName: 'Web',
  projectSlug: 'web',
  moduleName: 'auth',
  storyLabel: 'US-1',
  acLabel: 'AC one',
  archivedAt: '2026-11-04T17:27:00.000000+00:00',
  archivedByLabel: 'qa@example.test',
  notes: ['Module "auth" is archived.'],
};

const realFetch = globalThis.fetch;
let responses: Response[] = [];
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function render(props: { canWrite: boolean, rows?: typeof ROW[] }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AtcArchivedLibraryView, { rows: props.rows ?? [ROW], error: null, canWrite: props.canWrite }));
  });
  mounted.push({ container, root });
  return container;
}

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

async function clickRestore(container: HTMLElement) {
  await act(async () => {
    (byTestId(container, 'atc-restore') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  refreshes = 0;
  toasts.length = 0;
  responses = [];
  globalThis.fetch = (async () => responses.shift() ?? json({}, 500)) as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  for (const { container, root } of mounted) {
    await act(async () => { root.unmount(); });
    container.remove();
  }
  mounted = [];
});

describe('BK-571 — the archived view', () => {
  test('a read-only member sees the row and its note, with no restore action (AC-09)', async () => {
    const container = await render({ canWrite: false });
    expect(byTestId(container, 'atc-archived-row')).not.toBeNull();
    expect(byTestId(container, 'atc-archived-note')?.textContent).toContain('Module "auth" is archived.');
    expect(byTestId(container, 'atc-archived-by')?.textContent).toBe('qa@example.test');
    expect(byTestId(container, 'atc-restore')).toBeNull();
  });

  test('a failed restore names the failure and the same button retries it (AC-12)', async () => {
    responses = [
      json({ error: { code: 'internal_error', message: 'database unavailable' } }, 500),
      json({ atc: { id: ROW.id, title: ROW.title, archived_at: null, archived_by: null, held_by_parent: null, changed: true } }),
    ];
    const container = await render({ canWrite: true });

    await clickRestore(container);
    const error = byTestId(container, 'atc-archived-restore-error');
    expect(error?.textContent).toContain('Could not restore this ATC. Nothing changed.');
    expect(error?.textContent).toContain('database unavailable');
    expect(byTestId(container, 'atc-restore')?.textContent).toContain('Retry');
    expect(toasts).toHaveLength(0);
    expect(refreshes).toBe(0);

    await clickRestore(container);
    expect(byTestId(container, 'atc-archived-restore-error')).toBeNull();
    expect(toasts).toEqual([`Restored "${ROW.title}".`]);
    expect(refreshes).toBe(1);
  });

  test('a restore held by a parent says it stays out of the library', async () => {
    responses = [json({ atc: { id: ROW.id, title: ROW.title, archived_at: '2026-11-04T18:00:00+00:00', archived_by: null, held_by_parent: 'module', changed: true } })];
    const container = await render({ canWrite: true });
    await clickRestore(container);
    expect(toasts).toEqual([`Restored "${ROW.title}". It stays out of the library until its Module is restored.`]);
  });

  test('an empty workspace reads as empty, not as an error', async () => {
    const container = await render({ canWrite: true, rows: [] });
    expect(byTestId(container, 'atc-archived-empty')?.textContent).toContain('Nothing has been archived');
    expect(byTestId(container, 'atc-archived-empty')?.textContent).toContain('on its own');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
