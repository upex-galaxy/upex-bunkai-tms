import { installFetchDouble, jsonResponse, setInputValue } from '@components/billing/billing-test-support';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

// BK-232 — the create-project form turns a 422 `project_limit_reached` into the
// role-aware modal and keeps what the user typed; a later success (after the
// owner upgraded) creates the project in the same session, no reload.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replace = mock(() => {});
const refresh = mock(() => {});
// One stable router object: a new one per render would loop the effect.
const router = { replace, refresh };
await mock.module('next/navigation', () => ({ useRouter: () => router }));
await mock.module('sonner', () => ({ toast: { success: () => {} } }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { CreateProjectForm } = await import('./create-project-form');

const realSetTimeout = globalThis.setTimeout;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
let double: ReturnType<typeof installFetchDouble> | null = null;

const limitBody = (isOwner: boolean) => ({
  error: {
    code: 'project_limit_reached',
    message: 'This workspace has reached its plan\'s project limit.',
    details: {
      reason: 'project_limit_reached',
      resource: 'projects',
      plan: 'community',
      limit: 3,
      used: 3,
      is_owner: isOwner,
      owners: [{ user_id: 'u-1', email: 'mateo@acme.test' }],
    },
  },
});

async function flush() {
  await act(async () => { await new Promise<void>((resolve) => { realSetTimeout(resolve, 0); }); });
}

function id(testId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testId}"]`);
}

async function mountAndSubmit(responses: Response[]) {
  const queue = [...responses];
  double = installFetchDouble(() => queue.shift() ?? jsonResponse({}, 500));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(CreateProjectForm, { workspaceId: 'ws-1', hasProjects: true })); });
  mounted.push({ container, root });
  act(() => { setInputValue(id('create-project-name') as HTMLInputElement, 'Checkout flow'); });
  await submit();
}

async function submit() {
  await act(async () => {
    (id('create-project-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flush();
}

afterEach(() => {
  mounted.forEach(({ container, root }) => { act(() => { root.unmount(); }); container.remove(); });
  mounted = [];
  double?.restore();
  double = null;
  replace.mockClear();
  refresh.mockClear();
});

describe('CreateProjectForm at the plan limit', () => {
  test('member: the 422 opens the modal naming the owner, no inline error, form values kept, nothing navigated', async () => {
    await mountAndSubmit([jsonResponse(limitBody(false), 422)]);
    expect(id('plan-limit-modal')?.getAttribute('data-role')).toBe('non-owner');
    expect(id('plan-limit-modal-usage')?.textContent).toBe('3 of 3 projects used');
    expect(id('plan-limit-modal-owner')?.textContent).toBe('mateo@acme.test');
    expect(id('plan-limit-modal-upgrade')).toBeNull();
    expect(id('create-project-error')).toBeNull();
    expect((id('create-project-name') as HTMLInputElement).value).toBe('Checkout flow');
    expect(replace).not.toHaveBeenCalled();
  });

  test('owner: the same modal with the Upgrade plan action', async () => {
    await mountAndSubmit([jsonResponse(limitBody(true), 422)]);
    expect(id('plan-limit-modal-upgrade')?.getAttribute('href')).toBe('/settings/billing/upgrade');
  });

  test('closing the modal returns to the form with values intact; resubmitting after the upgrade creates the project', async () => {
    await mountAndSubmit([
      jsonResponse(limitBody(false), 422),
      jsonResponse({ project: { slug: 'checkout-flow' } }, 201),
    ]);
    act(() => { id('plan-limit-modal-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(id('plan-limit-modal')).toBeNull();
    expect((id('create-project-name') as HTMLInputElement).value).toBe('Checkout flow');
    await submit();
    expect(replace).toHaveBeenCalledWith('/projects/checkout-flow');
    expect(double?.calls).toHaveLength(2);
    // A refused attempt rotates the Idempotency-Key, so the retry is a new request, not a replay of the 422.
    expect(double?.calls[0].headers['idempotency-key']).not.toBe(double?.calls[1].headers['idempotency-key']);
  });

  test('a 422 without plan details (older server) falls back to the inline message', async () => {
    await mountAndSubmit([jsonResponse({ error: { code: 'project_limit_reached', message: 'Limit.', details: { reason: 'project_limit_reached' } } }, 422)]);
    expect(id('plan-limit-modal')).toBeNull();
    expect(id('create-project-error')?.textContent).toBe('Limit.');
  });
});
