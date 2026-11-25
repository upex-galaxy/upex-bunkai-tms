import type { AcceptanceCriterion, UserStory } from '@lib/types';
import type { ChangeEvent } from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-2485 — creating an ATC must drop the cached app layout before routing to it, or the sidebar's ATC Library count stays stale.
GlobalRegistrator.register();
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await GlobalRegistrator.unregister();
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');

const events: string[] = [];
const ROUTER = {
  push: (href: string) => { events.push(`push ${href}`); },
  refresh: () => { events.push('refresh'); },
};
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER }));
void mock.module('sonner', () => ({
  toast: { success: (message: string) => { events.push(`toast ${message}`); }, error: () => {} },
}));
let revalidateFails = false;
void mock.module('@app/(app)/atcs/actions', () => ({
  revalidateAfterAtcCreated: async () => {
    events.push('revalidate');
    if (revalidateFails) { throw new Error('revalidate failed'); }
  },
}));

function StepEditorStub({ language, value, onChange }: { language: string, value: string, onChange: (next: string) => void }) {
  return createElement('textarea', {
    'data-testid': `step-editor-${language}`,
    value,
    'onChange': (e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
  });
}
void mock.module('next/dynamic', () => ({ default: () => StepEditorStub }));

const { NewAtcEditor } = await import('./NewAtcEditor');

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const MODULE_ID = '00000000-0000-4000-8000-000000000002';
const STORY_ID = '00000000-0000-4000-8000-000000000003';
const AC_ID = '00000000-0000-4000-8000-000000000004';
const ATC_ID = '00000000-0000-4000-8000-000000000005';
const NOW = '2026-11-25T00:00:00Z';

const STORY: UserStory = {
  id: STORY_ID,
  module_id: MODULE_ID,
  project_id: PROJECT_ID,
  title: 'Guest checkout',
  description: null,
  external_id: 'US-7',
  external_url: null,
  status: 'ready_to_test',
  created_at: NOW,
  archived_at: null,
};
const AC: AcceptanceCriterion = { id: AC_ID, user_story_id: STORY_ID, title: 'Totals add up', description: null, position: 1, created_at: NOW, archived_at: null };

const realFetch = globalThis.fetch;
let response: Response;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function createAtc() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(NewAtcEditor, {
      projectSlug: 'checkout',
      modules: [{ id: MODULE_ID, path: 'checkout', name: 'checkout' }],
      stories: [STORY],
      storyAcs: { [STORY_ID]: [AC] },
      initialStoryId: STORY_ID,
      initialAcIds: [AC_ID],
      initialModuleId: MODULE_ID,
    }));
  });
  mounted.push({ container, root });
  await act(async () => {
    type(container.querySelector('[data-testid="new-atc-title"]') as HTMLInputElement, 'Totals add up at checkout');
    type(container.querySelector('[data-testid="step-editor-markdown"]') as HTMLTextAreaElement, '01. Open the cart');
  });
  await act(async () => {
    (container.querySelector('[data-testid="new-atc-submit"]') as HTMLElement).click();
  });
  return container;
}

beforeEach(() => {
  events.length = 0;
  revalidateFails = false;
  globalThis.fetch = (async () => {
    events.push('post');
    return response;
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

describe('create ATC: sidebar count freshness', () => {
  test('revalidates the app layout before routing to the new ATC', async () => {
    response = json({ atc: { id: ATC_ID } }, 201);
    await createAtc();
    expect(events).toEqual(['post', 'revalidate', 'toast ATC created', `push /projects/checkout/atcs/${ATC_ID}`]);
  });

  test('a failed revalidate still routes to the ATC that was created', async () => {
    revalidateFails = true;
    response = json({ atc: { id: ATC_ID } }, 201);
    await createAtc();
    expect(events).toEqual(['post', 'revalidate', 'toast ATC created', `push /projects/checkout/atcs/${ATC_ID}`]);
  });

  test('a refused create revalidates nothing and stays on the form', async () => {
    response = json({ error: { code: 'forbidden', message: 'Forbidden.' } }, 403);
    const container = await createAtc();
    expect(events).toEqual(['post']);
    expect(container.querySelector('[data-testid="new-atc-error"]')?.textContent).toBe('You do not have permission to create ATCs.');
  });
});
