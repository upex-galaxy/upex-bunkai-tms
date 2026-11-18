import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// BK-1949 — the Settings > Account display-name form, driven in a DOM with a
// stubbed `fetch`: what is sent, when nothing is sent, what the person reads.
// The router and toast doubles are ONE object each for the whole file (Bunkai
// rule GUARDED-TESTS). No browser and no server are involved, so this is NOT
// live-UI evidence.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refreshes: number[] = [];
const toasts: string[] = [];
const ROUTER = { push: () => {}, refresh: () => { refreshes.push(1); }, replace: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const TOAST = { success: (message: string) => { toasts.push(message); }, error: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER, usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
void mock.module('sonner', () => ({ toast: TOAST }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { DisplayNameForm } = await import('./DisplayNameForm');

interface Sent { method: string, body: unknown }
const sent: Sent[] = [];
let respond: (method: string, body: unknown) => Promise<Response> = async () => Response.json({ display_name: null });
const realFetch = globalThis.fetch;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  sent.length = 0;
  refreshes.length = 0;
  toasts.length = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
    sent.push({ method, body });
    return respond(method, body);
  }) as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = realFetch;
});

function render(ownName: string | null, providerName: string | null = null) {
  act(() => root.render(createElement(DisplayNameForm, { ownName, providerName })));
}

const $ = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const input = () => $('display-name-input') as HTMLInputElement;

// React tracks the input's value through the native setter; set it the way a
// keystroke does so onChange fires.
function type(value: string) {
  act(() => {
    // Runs the prototype's setter with the input as receiver, bypassing the
    // instance property React installs to track the value.
    Reflect.set(HTMLInputElement.prototype, 'value', value, input());
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(testId: string) {
  await act(async () => {
    $(testId)!.click();
  });
}

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('DisplayNameForm', () => {
  it('starts empty for a password account and with the provider name for Google (AC 1.4, D6)', () => {
    render(null, null);
    expect(input().value).toBe('');
    // The initial value is read on mount, so the second case needs a fresh one.
    act(() => root.unmount());
    root = createRoot(container);
    render(null, 'Elena Vargas');
    expect(input().value).toBe('Elena Vargas');
    expect($('display-name-remove')).toBeNull();
  });

  it('saves the trimmed name, confirms once and refreshes the page (AC 1.1, 2.6)', async () => {
    respond = async (_m, body) => Response.json({ display_name: (body as { display_name: string }).display_name });
    render(null);
    type('  Elena   Vargas  ');
    await click('display-name-save');
    await settle();

    expect(sent).toEqual([{ method: 'PUT', body: { display_name: 'Elena   Vargas' } }]);
    expect(toasts).toEqual(['Your display name was saved.']);
    expect(refreshes).toHaveLength(1);
    expect(input().value).toBe('Elena   Vargas');
    expect($('display-name-remove')).not.toBeNull();
  });

  it('refuses an empty or whitespace-only name without sending anything (AC 2.1, 2.2)', async () => {
    render('Elena Vargas');
    type('     ');
    await click('display-name-save');

    expect(sent).toEqual([]);
    expect($('display-name-error')?.textContent).toBe('The display name cannot be empty.');
  });

  it('refuses 81 characters without sending anything (AC 2.4)', async () => {
    render(null);
    type('A'.repeat(81));
    await click('display-name-save');

    expect(sent).toEqual([]);
    expect($('display-name-error')?.textContent).toContain('The name must be at most 80 characters');
  });

  it('keeps what was typed and says so when the save fails (AC 5.1)', async () => {
    respond = async () => { throw new TypeError('Failed to fetch'); };
    render('Elena Vargas');
    type('Elena V.');
    await click('display-name-save');
    await settle();

    expect(input().value).toBe('Elena V.');
    expect($('display-name-form-error')?.textContent).toBe('We couldn\'t save your name. Try again.');
    expect(toasts).toEqual([]);
  });

  it('tells a signed-out person to sign in again and keeps the text (E6)', async () => {
    respond = async () => Response.json({ error: { code: 'unauthorized', message: 'Authentication required.' } }, { status: 401 });
    render(null);
    type('Elena');
    await click('display-name-save');
    await settle();

    expect(input().value).toBe('Elena');
    expect($('display-name-form-error')?.textContent).toBe('Your session has expired. Sign in again to save your name.');
  });

  it('shows the server\'s 422 message under the field and keeps the text', async () => {
    respond = async () => Response.json(
      { error: { code: 'validation_failed', message: 'The display name cannot contain line breaks, tabs or hidden formatting characters.' } },
      { status: 422 },
    );
    render(null);
    type('Elena');
    await click('display-name-save');
    await settle();

    expect($('display-name-error')?.textContent).toContain('hidden formatting characters');
    expect(input().value).toBe('Elena');
  });

  it('sends one request and confirms once on a double press (AC 5.2)', async () => {
    let release: () => void = () => {};
    respond = async (_m, body) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return Response.json({ display_name: (body as { display_name: string }).display_name });
    };
    render(null);
    type('Elena');
    await act(async () => {
      $('display-name-save')!.click();
      $('display-name-save')!.click();
    });
    await act(async () => { release(); });
    await settle();

    expect(sent).toHaveLength(1);
    expect(toasts).toEqual(['Your display name was saved.']);
  });

  it('sends nothing when Enter is pressed on an unchanged name (D7)', async () => {
    render('Elena Vargas');
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(sent).toEqual([]);
    expect(toasts).toEqual([]);
  });

  it('keeps the field focusable while saving: read-only, not disabled', async () => {
    let release: () => void = () => {};
    respond = async (_m, body) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return Response.json({ display_name: (body as { display_name: string }).display_name });
    };
    render(null);
    type('Elena');
    await click('display-name-save');

    expect(input().readOnly).toBe(true);
    expect(input().disabled).toBe(false);
    await act(async () => { release(); });
    await settle();
    expect(input().readOnly).toBe(false);
  });

  it('sends nothing when Remove is cancelled (E1)', async () => {
    render('Elena Vargas');
    await click('display-name-remove');
    expect($('display-name-remove-dialog')?.textContent).toContain('Remove your display name?');
    await click('display-name-remove-cancel');

    expect($('display-name-remove-dialog')).toBeNull();
    expect(sent).toEqual([]);
    expect(input().value).toBe('Elena Vargas');
  });

  it('removes after confirming and falls back to the provider name in the field (AC 3.2)', async () => {
    respond = async () => Response.json({ display_name: null });
    render('Elena V.', 'Elena Vargas');
    await click('display-name-remove');
    await click('display-name-remove-confirm');
    await settle();

    expect(sent).toEqual([{ method: 'DELETE', body: undefined }]);
    expect(toasts).toEqual(['Your display name was removed.']);
    expect(input().value).toBe('Elena Vargas');
    expect($('display-name-remove')).toBeNull();
    // The button that opened the dialog is gone, so focus lands on the field.
    expect(document.activeElement).toBe(input());
  });

  it('tells a signed-out person to sign in again to remove (E6)', async () => {
    respond = async () => Response.json({ error: { code: 'unauthorized', message: 'Authentication required.' } }, { status: 401 });
    render('Elena V.');
    await click('display-name-remove');
    await click('display-name-remove-confirm');
    await settle();

    expect($('display-name-form-error')?.textContent).toBe('Your session has expired. Sign in again to remove your name.');
    expect(input().value).toBe('Elena V.');
  });
});
