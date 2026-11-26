import type { BugFormDialogContext } from './BugFormDialog';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-2484 — filing a defect must drop the cached app layout, or the sidebar's Bug Reports count stays stale.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const events: string[] = [];
let revalidateFails = false;
void mock.module('@app/(app)/bugs/actions', () => ({
  revalidateAfterBugFiled: async () => {
    events.push('revalidate');
    if (revalidateFails) { throw new Error('revalidate failed'); }
  },
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { BugFormDialog } = await import('./BugFormDialog');

const BUG_ID = '44444444-4444-4444-8444-444444444444';
const realFetch = globalThis.fetch;
let response: () => Response;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function mountForm(mode: 'standalone' | 'run-linked'): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const context: BugFormDialogContext = mode === 'standalone'
    ? { mode, projectId: 'p1', modules: [{ id: 'm1', name: 'Checkout' }] }
    : { mode, projectId: 'p1', runStepId: 's1', moduleLabel: 'Checkout' };
  await act(async () => {
    root.render(createElement(BugFormDialog, {
      open: true,
      onClose: () => { events.push('close'); },
      onCreated: (bug: { id: string }) => { events.push(`created ${bug.id}`); },
      context,
      initialTitle: 'Checkout total rounds incorrectly',
      initialSeverity: 'P3',
      initialStepsToReproduce: '',
      initialEvidenceUrls: [],
    }));
  });
  mounted.push({ container, root });
  if (mode === 'standalone') {
    const select = container.querySelector('[data-testid="bug-module-input"]') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'm1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  return container;
}

async function submit(container: HTMLElement): Promise<void> {
  await act(async () => {
    (container.querySelector('[data-testid="bug-form-submit"]') as HTMLElement).click();
  });
}

async function fileBug(mode: 'standalone' | 'run-linked') {
  const container = await mountForm(mode);
  await submit(container);
  return container;
}

function titleInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('[data-testid="bug-title-input"]');
  if (!input) { throw new Error('title input not rendered'); }
  return input;
}

async function typeTitle(container: HTMLElement, value: string): Promise<void> {
  const input = titleInput(container);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  events.length = 0;
  revalidateFails = false;
  globalThis.fetch = (async () => {
    events.push('post');
    return response();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  globalThis.fetch = realFetch;
});

describe('file bug: sidebar count freshness', () => {
  test('a standalone filing revalidates the app layout before handing the defect back', async () => {
    response = () => json({ bug: { id: BUG_ID } }, 201);
    await fileBug('standalone');
    expect(events).toEqual(['post', 'revalidate', `created ${BUG_ID}`, 'close']);
  });

  test('a run-linked filing revalidates the app layout too', async () => {
    response = () => json({ bug: { id: BUG_ID } }, 201);
    await fileBug('run-linked');
    expect(events).toEqual(['post', 'revalidate', `created ${BUG_ID}`, 'close']);
  });

  test('a failed revalidate still hands back the defect that was filed', async () => {
    revalidateFails = true;
    response = () => json({ bug: { id: BUG_ID } }, 201);
    await fileBug('standalone');
    expect(events).toEqual(['post', 'revalidate', `created ${BUG_ID}`, 'close']);
  });

  test('a refused filing revalidates nothing and keeps the drawer open', async () => {
    response = () => json({ error: { message: 'Select a module.' } }, 422);
    const container = await fileBug('standalone');
    expect(events).toEqual(['post']);
    expect(container.querySelector('[data-testid="bug-form-error"]')?.textContent).toBe('Select a module.');
  });
});

describe('file bug: title over the limit (BK-2096)', () => {
  test('the title field does not cap the length itself, so a paste is never cut', async () => {
    const container = await mountForm('standalone');
    expect(titleInput(container).hasAttribute('maxlength')).toBe(false);
  });

  test('a 201-character title is kept and File bug shows the title error without a request', async () => {
    const container = await mountForm('standalone');
    await typeTitle(container, 'x'.repeat(201));
    expect(titleInput(container).value).toHaveLength(201);

    await submit(container);

    expect(container.querySelector('[data-testid="bug-form-error"]')?.textContent).toBe('Title must be between 5 and 200 characters');
    expect(events).toEqual([]);
  });

  test('exactly 200 characters passes the title rule and files', async () => {
    response = () => json({ bug: { id: BUG_ID } }, 201);
    const container = await mountForm('standalone');
    await typeTitle(container, 'x'.repeat(200));

    await submit(container);

    expect(events[0]).toBe('post');
  });
});
