import type { ActivityItem, ActivityPage } from './ActivityView';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';

// BK-2589: "Load older activity" keeps the reading position. Driven in a DOM
// with a stubbed fetch, so this is NOT live-UI evidence.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ActivityView } = await import('./ActivityView');

function item(n: number): ActivityItem {
  return {
    id: `item-${n}`,
    entity_type: 'project',
    action: 'project.created',
    action_label: 'Created project',
    actor: { user_id: null, email: null },
    item: { label: `Project ${n}`, entity_id: null },
    payload: {},
    created_at: '2026-11-27T12:00:00.000Z',
  };
}

const realFetch = globalThis.fetch;
const realFocus = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')!;
const focusCalls: Array<{ testId: string | null, options: FocusOptions | undefined }> = [];
let nextPage: ActivityPage = { items: [], next_cursor: null };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  focusCalls.length = 0;
  globalThis.fetch = (async () => Response.json(nextPage)) as unknown as typeof fetch;
  Object.defineProperty(HTMLElement.prototype, 'focus', {
    ...realFocus,
    value(this: HTMLElement, options?: FocusOptions) {
      focusCalls.push({ testId: this.getAttribute('data-testid'), options });
      (realFocus.value as (this: HTMLElement, options?: FocusOptions) => void).call(this, options);
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = realFetch;
  Object.defineProperty(HTMLElement.prototype, 'focus', realFocus);
});

const byTestId = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

async function loadOlder() {
  await act(async () => {
    byTestId('activity-load-older')!.click();
  });
}

describe('BK-2589 ActivityView load older keeps the reading position', () => {
  it('moves focus to the foot without scrolling when the last page arrives', async () => {
    act(() => root.render(createElement(ActivityView, { initialPage: { items: [item(1), item(2)], next_cursor: 'cursor-1' } })));
    nextPage = { items: [item(3)], next_cursor: null };

    await loadOlder();

    expect(document.querySelectorAll('[data-testid="activity-rows"] tr').length).toBe(3);
    expect(byTestId('activity-load-older')).toBeNull();
    expect(document.activeElement).toBe(byTestId('activity-foot'));
    expect(focusCalls).toEqual([{ testId: 'activity-foot', options: { preventScroll: true } }]);
  });

  it('does not move focus while older pages remain', async () => {
    act(() => root.render(createElement(ActivityView, { initialPage: { items: [item(1)], next_cursor: 'cursor-1' } })));
    nextPage = { items: [item(2)], next_cursor: 'cursor-2' };

    await loadOlder();

    expect(document.querySelectorAll('[data-testid="activity-rows"] tr').length).toBe(2);
    expect(byTestId('activity-load-older')).not.toBeNull();
    expect(focusCalls).toEqual([]);
  });
});
