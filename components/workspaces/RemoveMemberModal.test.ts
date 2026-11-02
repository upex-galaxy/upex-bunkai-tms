import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-572 — the members screen's Remove affordance and its confirmation,
// rendered in happy-dom (the BillingOverviewView.test.ts setup: the DOM is
// registered in this file and React is imported afterwards). The endpoint is a
// fetch double; the real refusals are proven against the database in
// lib/workspaces/member-removal-isolation.test.ts. This is not live-UI
// evidence: no browser runs here.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refreshes: number[] = [];
void mock.module('next/navigation', () => ({
  useRouter: () => ({ refresh: () => { refreshes.push(Date.now()); } }),
}));
const toasts: Array<{ kind: string, message: string }> = [];
void mock.module('sonner', () => ({
  toast: {
    success: (message: string) => { toasts.push({ kind: 'success', message }); },
    error: (message: string) => { toasts.push({ kind: 'error', message }); },
  },
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { MembersClient } = await import('@app/(app)/workspaces/[id]/members/members-client');

const WS = '11111111-1111-1111-1111-111111111111';
const ME = 'aaaaaaaa-0000-0000-0000-000000000001';
const OWNER = 'aaaaaaaa-0000-0000-0000-000000000002';
const ADMIN2 = 'aaaaaaaa-0000-0000-0000-000000000003';
const MEMBER = 'aaaaaaaa-0000-0000-0000-000000000004';
const VIEWER = 'aaaaaaaa-0000-0000-0000-000000000005';

function member(user_id: string, role: string, email: string) {
  return { user_id, role, status: 'active', joined_at: '2026-01-01T00:00:00Z', email };
}

const MEMBERS = [
  member(OWNER, 'owner', 'olga@acme.test'),
  member(ME, 'admin', 'ada@acme.test'),
  member(ADMIN2, 'admin', 'bo@acme.test'),
  member(MEMBER, 'member', 'mia@acme.test'),
  member(VIEWER, 'viewer', 'leo@acme.test'),
];

const INVITES = [{
  id: 'inv-1',
  email: 'new@acme.test',
  role: 'member',
  expires_at: '2099-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  accepted_at: null,
  revoked_at: null,
  status: 'pending' as const,
}];

const realFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string, method: string }> = [];
let nextResponse: () => Promise<Response> = async () => new Response('{}', { status: 200 });
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function render(props: { callerRole: string | null, currentUserId?: string, members?: typeof MEMBERS }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(MembersClient, {
      workspaceId: WS,
      workspaceName: 'Acme QA',
      currentUserId: props.currentUserId ?? ME,
      callerRole: props.callerRole,
      members: props.members ?? MEMBERS,
      invites: INVITES,
    }));
  });
  mounted.push({ container, root });
  return container;
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function click(el: Element | null) {
  if (!el) {
    throw new Error('element not found');
  }
  act(() => {
    // A browser focuses a clicked button; happy-dom does not.
    (el as HTMLElement).focus();
    (el as HTMLElement).click();
  });
}

beforeEach(() => {
  fetchCalls = [];
  toasts.length = 0;
  refreshes.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), method: init?.method ?? 'GET' });
    return nextResponse();
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

function removeButtons(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="member-remove-"]'))
    .map(el => el.getAttribute('data-testid')!.replace('member-remove-', ''));
}

describe('members screen — where Remove appears (D56)', () => {
  test('rows show the email, never the raw id, and "(you)" on the caller\'s row', () => {
    const container = render({ callerRole: 'admin' });
    const myRow = container.querySelector(`[data-testid="member-row-${ME}"]`)!;
    expect(myRow.textContent).toContain('ada@acme.test (you)');
    expect(container.textContent).not.toContain(OWNER);
  });

  test('an Admin gets Remove on another Admin, the Member and the Viewer; nothing on the Owner or their own row (AC-02, AC-11)', () => {
    const container = render({ callerRole: 'admin' });
    expect(removeButtons(container).sort()).toEqual([ADMIN2, MEMBER, VIEWER].sort());
    // Absent, not disabled: no element at all on the Owner row.
    expect(container.querySelector(`[data-testid="member-row-${OWNER}"] button`)).toBeNull();
    expect(container.querySelector(`[data-testid="member-row-${ME}"] button`)).toBeNull();
  });

  test('an Owner gets Remove on every other row, Owners included (AC-01)', () => {
    const members = [member(ME, 'owner', 'me@acme.test'), member(OWNER, 'owner', 'olga@acme.test'), member(VIEWER, 'viewer', 'leo@acme.test')];
    const container = render({ callerRole: 'owner', members });
    expect(removeButtons(container).sort()).toEqual([OWNER, VIEWER].sort());
  });

  test('a Member or Viewer gets no Remove anywhere (AC-03)', () => {
    for (const role of ['member', 'viewer']) {
      const container = render({ callerRole: role });
      expect(removeButtons(container)).toEqual([]);
    }
  });

  test('the Remove button names its row, and invite rows keep only Rotate link / Revoke (E8)', () => {
    const container = render({ callerRole: 'admin' });
    expect(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`)?.getAttribute('aria-label')).toBe('Remove mia@acme.test');
    const inviteButtons = Array.from(container.querySelectorAll('section:last-of-type button')).map(b => b.textContent);
    expect(inviteButtons).toEqual(['Rotate link', 'Revoke']);
  });
});

describe('the removal confirmation (AC-04, AC-05, AC-14, AC-20)', () => {
  test('names the person and both consequences, moves focus to Cancel, and nothing is sent yet', () => {
    const container = render({ callerRole: 'admin' });
    click(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`));
    const dialog = document.querySelector('[data-testid="remove-member-modal"]')!;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent;
    expect(desc).toContain('mia@acme.test');
    expect(desc).toContain('(Member)');
    expect(desc).toContain('Acme QA');
    expect(desc).toContain('Personal Access Tokens for this workspace stop working');
    expect(desc).toContain('Bugs assigned to them become unassigned');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('remove-member-cancel');
    expect(document.querySelector('[data-testid="remove-member-confirm"]')?.textContent).toBe('Remove mia@acme.test');
    expect(fetchCalls).toEqual([]);
  });

  test('Cancel closes it and sends nothing (AC-05)', () => {
    const container = render({ callerRole: 'admin' });
    click(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`));
    click(document.querySelector('[data-testid="remove-member-cancel"]'));
    expect(document.querySelector('[data-testid="remove-member-modal"]')).toBeNull();
    expect(fetchCalls).toEqual([]);
  });

  test('Escape dismisses it and focus returns to the row it was opened from (AC-20)', () => {
    const container = render({ callerRole: 'admin' });
    click(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-testid="remove-member-modal"]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-testid')).toBe(`member-remove-${MEMBER}`);
    expect(fetchCalls).toEqual([]);
  });

  test('confirming calls the endpoint once, closes, toasts, refreshes and focuses the list heading', async () => {
    nextResponse = async () => new Response(JSON.stringify({ removed_user_id: MEMBER }), { status: 200 });
    const container = render({ callerRole: 'admin' });
    click(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`));
    click(document.querySelector('[data-testid="remove-member-confirm"]'));
    await flush();
    await flush();
    expect(fetchCalls).toEqual([{ url: `/api/v1/workspaces/${WS}/members/${MEMBER}`, method: 'DELETE' }]);
    expect(document.querySelector('[data-testid="remove-member-modal"]')).toBeNull();
    expect(toasts).toEqual([{ kind: 'success', message: 'mia@acme.test was removed from Acme QA.' }]);
    expect(refreshes.length).toBe(1);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('members-heading');
  });

  test('a server failure keeps the dialog open so it can be retried, and says nothing changed (AC-14)', async () => {
    nextResponse = async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    const container = render({ callerRole: 'admin' });
    click(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`));
    click(document.querySelector('[data-testid="remove-member-confirm"]'));
    await flush();
    expect(document.querySelector('[data-testid="remove-member-modal"]')).not.toBeNull();
    expect(toasts).toEqual([{ kind: 'error', message: 'Could not remove mia@acme.test. Nothing was changed. Try again.' }]);
    expect((document.querySelector('[data-testid="remove-member-confirm"]') as HTMLButtonElement).disabled).toBe(false);
    expect(refreshes.length).toBe(0);
  });

  test('a refusal closes the dialog, shows the server copy and refreshes the list', async () => {
    nextResponse = async () => new Response(JSON.stringify({ error: { message: 'Only an Owner can remove an Owner.' } }), { status: 403 });
    const container = render({ callerRole: 'admin' });
    click(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`));
    click(document.querySelector('[data-testid="remove-member-confirm"]'));
    await flush();
    expect(document.querySelector('[data-testid="remove-member-modal"]')).toBeNull();
    expect(toasts).toEqual([{ kind: 'error', message: 'Only an Owner can remove an Owner.' }]);
    expect(refreshes.length).toBe(1);
  });

  test('a 404 says the teammate is no longer a member', async () => {
    nextResponse = async () => new Response(JSON.stringify({ error: { message: 'Workspace member not found.' } }), { status: 404 });
    const container = render({ callerRole: 'admin' });
    click(container.querySelector(`[data-testid="member-remove-${MEMBER}"]`));
    click(document.querySelector('[data-testid="remove-member-confirm"]'));
    await flush();
    expect(toasts).toEqual([{ kind: 'error', message: 'This teammate is no longer a member of this workspace.' }]);
  });
});
