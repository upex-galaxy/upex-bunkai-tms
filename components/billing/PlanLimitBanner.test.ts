import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';

// BK-232 PlanLimitBanner: copy per state, the owner/non-owner split and
// session-scoped dismissal. happy-dom is registered per file before React loads.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { PlanLimitBanner, dismissalKey } = await import('@components/billing/PlanLimitBanner');

type Props = Parameters<typeof PlanLimitBanner>[0];

const OWNERS = [{ user_id: 'u-1', email: 'mateo@acme.test' }];
const cloud40: Props = { workspaceId: 'ws-1', resource: 'projects', state: 'warning', used: 40, limit: 50, planName: 'Cloud', isOwner: false, owners: OWNERS };

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function mount(props: Props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(PlanLimitBanner, props)); });
  mounted.push({ container, root });
  return container;
}

function id(container: HTMLElement, testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => {
  mounted.forEach(({ container, root }) => { act(() => { root.unmount(); }); container.remove(); });
  mounted = [];
});

describe('PlanLimitBanner copy', () => {
  test('approaching: says 40 of 50 projects used, how many remain and that nothing is blocked', () => {
    const c = mount(cloud40);
    expect(id(c, 'plan-limit-banner')?.getAttribute('role')).toBe('status');
    expect(id(c, 'plan-limit-banner-title')?.textContent).toBe('Approaching plan limit');
    expect(id(c, 'plan-limit-banner-usage')?.textContent).toBe('40 of 50 projects used');
    expect(id(c, 'plan-limit-banner-body')?.textContent).toContain('You can still create 10 more. Nothing is blocked yet.');
  });

  test('at the cap: a non-blocking notice that existing projects are untouched', () => {
    const c = mount({ ...cloud40, state: 'limit-reached', planName: 'Community', used: 3, limit: 3 });
    expect(id(c, 'plan-limit-banner-title')?.textContent).toBe('Project limit reached');
    expect(id(c, 'plan-limit-banner-usage')?.textContent).toBe('3 of 3 projects used');
    expect(id(c, 'plan-limit-banner-body')?.textContent).toContain('Your existing projects are untouched');
    expect(id(c, 'plan-limit-banner-body')?.textContent).toContain('on the Community plan');
  });
});

describe('PlanLimitBanner roles', () => {
  test('owner gets an Upgrade plan link to the billing upgrade flow', () => {
    const c = mount({ ...cloud40, isOwner: true });
    expect(id(c, 'plan-limit-banner-upgrade')?.getAttribute('href')).toBe('/settings/billing/upgrade');
    expect(id(c, 'plan-limit-banner-owner')).toBeNull();
  });

  test('a non-owner is told the owner and sees no upgrade or checkout link', () => {
    const c = mount(cloud40);
    expect(id(c, 'plan-limit-banner-owner')?.textContent).toBe('Ask mateo@acme.test, the workspace owner, to upgrade.');
    expect(id(c, 'plan-limit-banner-upgrade')).toBeNull();
    expect(c.querySelector('a')).toBeNull();
  });
});

describe('PlanLimitBanner dismissal', () => {
  test('dismiss hides it, persists for the session, and it stays hidden on remount', () => {
    const c = mount(cloud40);
    act(() => { id(c, 'plan-limit-banner-dismiss')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(id(c, 'plan-limit-banner')).toBeNull();
    expect(window.sessionStorage.getItem(dismissalKey('ws-1', 'projects', 'warning'))).toBe('1');
    expect(id(mount(cloud40), 'plan-limit-banner')).toBeNull();
  });

  test('a dismissed approaching banner does not hide the later limit-reached notice', () => {
    window.sessionStorage.setItem(dismissalKey('ws-1', 'projects', 'warning'), '1');
    expect(id(mount({ ...cloud40, state: 'limit-reached', used: 50 }), 'plan-limit-banner')).not.toBeNull();
  });

  test('dismissal is scoped to the workspace', () => {
    window.sessionStorage.setItem(dismissalKey('ws-1', 'projects', 'warning'), '1');
    expect(id(mount({ ...cloud40, workspaceId: 'ws-2' }), 'plan-limit-banner')).not.toBeNull();
  });
});
