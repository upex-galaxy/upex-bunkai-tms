import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

// BK-2092: a title pasted past 200 characters must reach the filing title
// rule and show its error, not be cut to 200 by the input itself.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: () => {}, refresh: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => router }));
void mock.module('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { BugCorrection } = await import('@components/bugs/BugCorrectionDialog');

const BUG = { title: 'Checkout total rounds incorrectly', severity: 'P2', description: null, steps_to_reproduce: '1. Open checkout', content_version: 1 };
const realFetch = globalThis.fetch;
let fetchCalls = 0;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

afterEach(() => {
  mounted.forEach(({ container, root }) => {
    act(() => { root.unmount(); });
    container.remove();
  });
  mounted = [];
  globalThis.fetch = realFetch;
});

async function openDialog(): Promise<HTMLElement> {
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response('{}', { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(BugCorrection, { bugId: 'b1', bug: BUG })); });
  mounted.push({ container, root });
  await act(async () => { container.querySelector<HTMLButtonElement>('[data-testid="bug-detail-correct"]')?.click(); });
  return container;
}

function titleInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('[data-testid="bug-correction-title"]');
  if (!input) { throw new Error('title input not rendered'); }
  return input;
}

async function typeTitle(container: HTMLElement, value: string): Promise<void> {
  const input = titleInput(container);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  await act(async () => {
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('BugCorrection title over the limit (BK-2092)', () => {
  test('the title field does not cap the length itself, so a paste is never cut', async () => {
    const container = await openDialog();
    expect(titleInput(container).hasAttribute('maxlength')).toBe(false);
  });

  test('a 201-character title is kept and Save shows the filing title error without a request', async () => {
    const container = await openDialog();
    await typeTitle(container, 'x'.repeat(201));
    expect(titleInput(container).value).toHaveLength(201);

    fetchCalls = 0;
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-testid="bug-correction-save"]')?.click(); });

    expect(container.querySelector('[data-testid="bug-correction-title-error"]')?.textContent).toBe('Title must be between 5 and 200 characters');
    expect(titleInput(container).getAttribute('aria-invalid')).toBe('true');
    expect(fetchCalls).toBe(0);
  });

  test('exactly 200 characters passes the title rule and saves', async () => {
    const container = await openDialog();
    await typeTitle(container, 'x'.repeat(200));

    fetchCalls = 0;
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-testid="bug-correction-save"]')?.click(); });

    expect(container.querySelector('[data-testid="bug-correction-title-error"]')).toBeNull();
    expect(fetchCalls).toBe(1);
  });
});
