import type { AcceptanceCriterion, Atc, Module, UserStory } from '@lib/types';
import type { ChangeEvent } from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// BK-2256: pins the §4.4 layout shipped in ffc09e9e; happy-dom with Monaco stubbed, not live-UI evidence.
GlobalRegistrator.register();
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await GlobalRegistrator.unregister();
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');

const ROUTER = { push: () => {}, refresh: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const WORKBENCH = { canCreate: true };
void mock.module('next/navigation', () => ({ useRouter: () => ROUTER }));
void mock.module('@app/(app)/projects/[projectSlug]/workbench-context', () => ({ useWorkbench: () => WORKBENCH }));
void mock.module('@app/(app)/atcs/actions', () => ({ revalidateAfterArchiveChange: async () => {} }));

function StepEditorStub({ language, value, onChange }: { language: string, value: string, onChange: (next: string) => void }) {
  return createElement('textarea', {
    'data-testid': `step-editor-${language}`,
    value,
    'onChange': (e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
  });
}
void mock.module('next/dynamic', () => ({ default: () => StepEditorStub }));

const { AtcEditor } = await import('@components/atcs/AtcEditor');
const { NewAtcEditor } = await import('@components/atcs/NewAtcEditor');

const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const MODULE_ID = '00000000-0000-4000-8000-000000000002';
const STORY_ID = '00000000-0000-4000-8000-000000000003';
const AC_ONE = '00000000-0000-4000-8000-000000000004';
const AC_TWO = '00000000-0000-4000-8000-000000000005';
const ATC_ID = '00000000-0000-4000-8000-000000000006';
const NOW = '2026-11-22T00:00:00Z';

const STORY: UserStory = {
  id: STORY_ID,
  module_id: MODULE_ID,
  project_id: PROJECT_ID,
  title: 'Sign in with a magic link',
  description: null,
  external_id: 'US-42',
  external_url: null,
  status: 'ready_to_test',
  created_at: NOW,
  archived_at: null,
};

function ac(id: string, title: string, position: number): AcceptanceCriterion {
  return { id, user_story_id: STORY_ID, title, description: null, position, created_at: NOW, archived_at: null };
}
const STORY_ACS = { [STORY_ID]: [ac(AC_ONE, 'Link arrives by email', 1), ac(AC_TWO, 'Expired link is refused', 2)] };

const MODULE: Module = {
  id: MODULE_ID,
  project_id: PROJECT_ID,
  parent_module_id: null,
  path: 'auth/login',
  name: 'login',
  position: 1,
  description: null,
  created_at: NOW,
  archived_at: null,
};

const ATC: Atc = {
  id: ATC_ID,
  project_id: PROJECT_ID,
  module_id: MODULE_ID,
  user_story_id: STORY_ID,
  slug: 'auth/login/atc-20409822',
  title: 'Magic link signs the user in',
  layer: 'API',
  version: 1,
  status: 'pass',
  tags: ['smoke'],
  technique: null,
  priority: null,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderEdit() {
  act(() => {
    root.render(createElement(AtcEditor, {
      atc: ATC,
      module: MODULE,
      modulePath: MODULE.path,
      initialSteps: [],
      initialAssertions: [],
      initialAcIds: [AC_ONE],
      stories: [STORY],
      storyAcs: STORY_ACS,
      projectSlug: 'demo',
      onSave: async () => ({ ok: true as const, affectedTestCount: 0 }),
    }));
  });
}

function renderNew() {
  act(() => {
    root.render(createElement(NewAtcEditor, {
      projectSlug: 'demo',
      modules: [{ id: MODULE_ID, path: MODULE.path, name: MODULE.name }],
      stories: [STORY],
      storyAcs: STORY_ACS,
      initialModuleId: MODULE_ID,
    }));
  });
}

function preview(): HTMLElement {
  const aside = container.querySelector('aside');
  if (!aside) { throw new Error('no preview pane rendered'); }
  return aside;
}

function compose(): HTMLElement {
  const column = preview().previousElementSibling;
  if (!(column instanceof HTMLElement)) { throw new TypeError('no compose column before the preview'); }
  return column;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function buttonByText(scope: HTMLElement, text: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll('button')].find(b => b.textContent?.includes(text));
  if (!found) { throw new Error(`no button with "${text}"`); }
  return found;
}

function addTag(value: string) {
  const input = compose().querySelector<HTMLInputElement>('input[placeholder="regression, smoke, P1…"], input[placeholder=""]');
  if (!input) { throw new Error('no tag input'); }
  setValue(input, value);
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

function expectLayout() {
  const pane = preview();
  expect(pane.textContent).toContain('Live preview');
  expect(pane.textContent).toContain('This is what test runners and AI agents will see.');
  expect(pane.textContent).toContain('schema · atc.v1');
  expect(pane.textContent).toContain('Updated live as you edit');
  expect(pane.querySelectorAll('input, textarea, select, button')).toHaveLength(0);

  const left = compose();
  expect(left.textContent).toContain('Linked User Story');
  expect(left.textContent).toContain('Acceptance Criteria');
  expect(left.querySelector('[data-testid="step-editor-markdown"]')).not.toBeNull();
  expect(left.querySelector('[data-testid="step-editor-yaml"]')).not.toBeNull();
}

function expectLiveEdits() {
  const titleInput = compose().querySelector<HTMLInputElement>('input[placeholder^="A single observable behaviour"]')!;
  setValue(titleInput, 'Expired magic link is refused');
  expect(preview().querySelector('h2')?.textContent).toBe('Expired magic link is refused');

  click(buttonByText(compose(), 'Unit'));
  expect(preview().querySelector('.layer-chip')?.textContent).toBe('Unit');

  setValue(compose().querySelector<HTMLTextAreaElement>('[data-testid="step-editor-markdown"]')!, '01. Open the expired link');
  expect(preview().textContent).toContain('Open the expired link');

  setValue(compose().querySelector<HTMLTextAreaElement>('[data-testid="step-editor-yaml"]')!, '- status is 401');
  expect(preview().textContent).toContain('status is 401');

  addTag('Regression');
  expect(preview().textContent).toContain('regression');

  click(buttonByText(compose(), 'Expired link is refused'));
  expect(preview().textContent).toContain('Expired link is refused');
}

describe('ATC editor live preview (BK-2256, §4.4)', () => {
  it('edit: right column is the read-only preview, anchoring sits inline in Compose', () => {
    renderEdit();
    expectLayout();
    const pane = preview();
    expect(pane.textContent).toContain(ATC_ID);
    expect(pane.textContent).toContain('auth › login');
    expect(pane.textContent).toContain('US-42');
    expect(pane.textContent).toContain('Link arrives by email');
    expect(pane.textContent).not.toContain('Expired link is refused');
    expect(pane.textContent).toContain('smoke');
    expect(pane.querySelector('.dot[data-status="pass"]')).not.toBeNull();
    expect(pane.textContent).not.toContain('draft');
  });

  it('edit: the preview follows every Compose field with no save', () => {
    renderEdit();
    expectLiveEdits();
  });

  it('new: right column is the draft preview, anchoring sits inline in Compose', () => {
    renderNew();
    expectLayout();
    const pane = preview();
    expect(pane.textContent).toContain('ATC-—');
    expect(pane.querySelector('.status-chip[data-status="skipped"]')?.textContent).toBe('draft');
    expect(pane.textContent).toContain('auth › login');
    expect(pane.textContent).toContain('Untitled ATC');
    expect(pane.textContent).not.toContain('US-42');
  });

  it('new: picking the story and an AC inline shows them in the preview at once', () => {
    renderNew();
    click(buttonByText(compose(), 'Sign in with a magic link'));
    expect(preview().textContent).toContain('US-42');
    expectLiveEdits();
  });
});
