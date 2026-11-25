import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-2485 — removing a User Story archives its ATCs, so the cached app layout must drop before the dialog closes or the ATC Library count stays stale.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const events: string[] = [];
const router = { push: () => {}, refresh: () => { events.push('refresh'); } };
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));
void mock.module('sonner', () => ({
  toast: { success: (message: string) => { events.push(`toast ${message}`); }, error: () => {} },
}));
let revalidateFails = false;
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterArchiveChange: async () => {
    events.push('revalidate');
    if (revalidateFails) { throw new Error('revalidate failed'); }
  },
}));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { DeleteUserStoryDialog } = await import('./delete-user-story-dialog');

const STORY_ID = '55555555-5555-4555-8555-555555555555';
const realFetch = globalThis.fetch;
let response: Response;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function removeStory() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(DeleteUserStoryDialog, {
      storyId: STORY_ID,
      storyTitle: 'Guest checkout',
      onDeleted: () => { events.push('deleted'); },
    }));
  });
  mounted.push({ container, root });
  await act(async () => {
    (container.querySelector('[data-testid="delete-user-story-confirm"]') as HTMLElement).click();
  });
  return container;
}

beforeEach(() => {
  events.length = 0;
  revalidateFails = false;
  globalThis.fetch = (async () => response) as unknown as typeof fetch;
});

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  globalThis.fetch = realFetch;
});

describe('remove user story: sidebar count freshness', () => {
  test('revalidates the app layout before the dialog closes', async () => {
    response = json({ archived: { id: STORY_ID } }, 200);
    await removeStory();
    expect(events).toEqual(['revalidate', 'toast Removed “Guest checkout”', 'refresh', 'deleted']);
  });

  test('a failed revalidate still closes on the removal that happened', async () => {
    revalidateFails = true;
    response = json({ archived: { id: STORY_ID } }, 200);
    await removeStory();
    expect(events).toEqual(['revalidate', 'toast Removed “Guest checkout”', 'refresh', 'deleted']);
  });

  test('a refused removal revalidates nothing and stays open', async () => {
    response = json({ error: { code: 'not_found', message: 'User story not found.' } }, 404);
    const container = await removeStory();
    expect(events).toEqual([]);
    expect(container.querySelector('[data-testid="delete-user-story-error"]')?.textContent).toBe('This story no longer exists.');
  });
});
