import type { PlanLimitDetails } from '@lib/billing/plan-limit';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, describe, expect, test } from 'bun:test';

// BK-232 PlanLimitModal: the role split and that closing has no side effect.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { PlanLimitModal } = await import('@components/billing/PlanLimitModal');

const base: PlanLimitDetails = {
  reason: 'project_limit_reached',
  resource: 'projects',
  plan: 'community',
  limit: 3,
  used: 3,
  is_owner: false,
  owners: [{ user_id: 'u-1', email: 'mateo@acme.test' }],
};

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function mount(details: PlanLimitDetails, onOpenChange: (open: boolean) => void = () => {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(PlanLimitModal, { open: true, onOpenChange, details })); });
  mounted.push({ container, root });
}

// The dialog renders in a portal on document.body.
function id(testId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testId}"]`);
}

afterEach(() => {
  mounted.forEach(({ container, root }) => { act(() => { root.unmount(); }); container.remove(); });
  mounted = [];
});

describe('PlanLimitModal', () => {
  test('member: 3 of 3 projects used, the owner is named, no upgrade or checkout action', () => {
    mount(base);
    expect(id('plan-limit-modal-usage')?.textContent).toBe('3 of 3 projects used');
    expect(id('plan-limit-modal-body')?.textContent).toContain('The Community plan caps this workspace at 3 projects');
    expect(id('plan-limit-modal-owner')?.textContent).toBe('mateo@acme.test');
    expect(id('plan-limit-modal-upgrade')).toBeNull();
    expect(id('plan-limit-modal')?.querySelector('a')).toBeNull();
    expect(id('plan-limit-modal-close')?.textContent).toBe('Got it');
  });

  test('admin gets the member modal: is_owner false means owner name, never checkout', () => {
    mount({ ...base, is_owner: false });
    expect(id('plan-limit-modal')?.getAttribute('data-role')).toBe('non-owner');
    expect(id('plan-limit-modal-upgrade')).toBeNull();
  });

  test('owner: one primary Upgrade plan action to the upgrade flow plus Cancel', () => {
    mount({ ...base, is_owner: true });
    expect(id('plan-limit-modal')?.getAttribute('data-role')).toBe('owner');
    expect(id('plan-limit-modal-upgrade')?.getAttribute('href')).toBe('/settings/billing/upgrade');
    expect(id('plan-limit-modal-upgrade')?.textContent).toBe('Upgrade plan');
    expect(id('plan-limit-modal-close')?.textContent).toBe('Cancel');
    expect(id('plan-limit-modal-owner')).toBeNull();
  });

  test('without a readable owner the member is still told to ask the owner', () => {
    mount({ ...base, owners: [] });
    expect(id('plan-limit-modal-owner')?.textContent).toContain('Ask the workspace owner to upgrade.');
  });

  test('closing only asks the caller to close: no navigation, nothing created', () => {
    const calls: boolean[] = [];
    mount({ ...base, is_owner: true }, (open) => { calls.push(open); });
    act(() => { id('plan-limit-modal-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(calls).toEqual([false]);
  });

  test('numbers come from the effective plan sent by the API (grace ended: Community 3, not Cloud 50)', () => {
    mount({ ...base, used: 10 });
    expect(id('plan-limit-modal-usage')?.textContent).toBe('10 of 3 projects used');
  });
});
