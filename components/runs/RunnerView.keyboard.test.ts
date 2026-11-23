import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// BK-600 - the Runner driven from the keyboard, rendered in happy-dom (the
// ArchiveAtcDialog.test.ts setup: DOM registered here, React imported after).
// The mark endpoint is a fetch double. No browser runs here, so this is not
// live-UI evidence.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: () => {}, refresh: () => {}, replace: () => {} };
void mock.module('next/navigation', () => ({ useRouter: () => router }));

const workbench = { registerRunLabel: () => {} };
void mock.module('@app/(app)/projects/[projectSlug]/workbench-context', () => ({ useWorkbench: () => workbench }));

const toasts: string[] = [];
void mock.module('sonner', () => ({
  toast: {
    success: (message: string) => { toasts.push(message); },
    info: (message: string) => { toasts.push(message); },
    error: (message: string) => { toasts.push(message); },
  },
}));

const channel = { on: () => channel };
const supabase = { channel: () => channel, removeChannel: async () => {}, realtime: {} };
void mock.module('@lib/supabase/client', () => ({ createClient: () => supabase }));
void mock.module('@lib/supabase/realtime-auth', () => ({ subscribeWithUserAuth: () => () => {} }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { RunnerView } = await import('@components/runs/RunnerView');
const { isMacPlatform, MARK_NOT_ALLOWED_MESSAGE, REPORT_BUG_NOT_FAILED_MESSAGE } = await import('@lib/runs/runner-keyboard');
const { RUN_STEP_MARKING_CLOSED_MESSAGE } = await import('@lib/runs/mark-step-view');

type RunDetail = Parameters<typeof RunnerView>[0]['run'];
type RunStep = RunDetail['atcs'][number]['steps'][number];

const IS_MAC = isMacPlatform(navigator);
const MOD = IS_MAC ? { metaKey: true } : { ctrlKey: true };

function step(atc: number, position: number, overrides: Partial<RunStep> = {}): RunStep {
  return {
    id: `s${atc}${position}`,
    atc_step_id: null,
    position,
    content: `ATC ${atc} step ${position}`,
    input_data: null,
    expected: null,
    status: 'pending',
    note: null,
    evidence_url: null,
    executed_at: null,
    ...overrides,
  };
}

function makeRun(overrides: { status?: RunDetail['status'], steps?: Record<string, Partial<RunStep>> } = {}): RunDetail {
  const atc = (n: number) => ({
    id: `ra${n}`,
    atc_id: `atc${n}`,
    position: n,
    atc_title: `ATC ${n}`,
    status: 'pending' as const,
    steps: [1, 2, 3].map(p => step(n, p, overrides.steps?.[`s${n}${p}`])),
  });
  return {
    id: 'run1',
    workspace_id: 'w1',
    project_id: 'p1',
    test_id: 't1',
    environment_id: 'e1',
    environment_name: 'staging',
    status: overrides.status ?? 'running',
    abort_reason: null,
    executor_mode: 'human',
    executor_user_id: 'me',
    test_title: 'RUN-1839',
    version: 1,
    started_at: '2026-11-23T10:00:00Z',
    finished_at: null,
    created_at: '2026-11-23T10:00:00Z',
    updated_at: '2026-11-23T10:00:00Z',
    atc_count: 2,
    step_count: 6,
    module_id: null,
    module_name: 'Checkout',
    atcs: [atc(1), atc(2)],
  };
}

const realFetch = globalThis.fetch;
let markCalls: Array<{ stepId: string, body: Record<string, unknown> }> = [];
let markResponse: (stepId: string, body: Record<string, unknown>) => Response;
let currentRun: RunDetail;
let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function markedRun(stepId: string, body: Record<string, unknown>): RunDetail {
  currentRun = {
    ...currentRun,
    atcs: currentRun.atcs.map(a => ({
      ...a,
      steps: a.steps.map(s => (s.id === stepId
        ? { ...s, status: body.status as RunStep['status'], note: (body.note as string) || null, evidence_url: (body.evidence_url as string) || null }
        : s)),
    })),
  };
  return currentRun;
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function render(run: RunDetail, props: Record<string, unknown> = {}) {
  currentRun = run;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(RunnerView, { run, projectSlug: 'shop', canAbort: true, canFinish: true, canMark: true, canReportBug: true, ...props }));
  });
  mounted.push({ container, root });
  await flush();
  return container;
}

function byId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!(el instanceof HTMLElement)) { throw new TypeError(`no element ${id}`); }
  return el;
}

function maybe(container: HTMLElement, id: string): Element | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

function currentSteps(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[aria-current="step"]')).map(el => el.getAttribute('data-testid') ?? '');
}

async function press(code: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init }));
  });
  await flush();
}

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function setValue(el: HTMLElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  toasts.length = 0;
  markCalls = [];
  markResponse = (stepId, body) => json({ run: markedRun(stepId, body) });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const match = url.match(/\/steps\/([^/]+)\/mark$/);
    if (match && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      markCalls.push({ stepId: match[1], body });
      return markResponse(match[1], body);
    }
    return json({});
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

describe('the focused-step cursor', () => {
  test('starts on the first unrun step, exactly one step is current, and it is focusable', async () => {
    const container = await render(makeRun({ steps: { s11: { status: 'passed' } } }));
    expect(currentSteps(container)).toEqual(['runner-step-1-2']);
    expect(byId(container, 'runner-step-1-2').tabIndex).toBe(0);
    expect(byId(container, 'runner-step-1-1').tabIndex).toBe(-1);
  });

  test('starts on the very first step when every step carries a verdict', async () => {
    const steps = Object.fromEntries(['s11', 's12', 's13', 's21', 's22', 's23'].map(id => [id, { status: 'passed' as const }]));
    const container = await render(makeRun({ steps }));
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
  });

  test('arrows move it across the ATC boundary, focus follows, and it never wraps', async () => {
    const container = await render(makeRun());
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowDown');
    expect(currentSteps(container)).toEqual(['runner-step-2-1']);
    expect(document.activeElement).toBe(byId(container, 'runner-step-2-1'));
    await press('ArrowUp');
    expect(currentSteps(container)).toEqual(['runner-step-1-3']);
    for (let i = 0; i < 6; i++) { await press('ArrowDown'); }
    expect(currentSteps(container)).toEqual(['runner-step-2-3']);
    await press('ArrowUp');
    for (let i = 0; i < 6; i++) { await press('ArrowUp'); }
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
  });

  test('clicking a step moves it there', async () => {
    const container = await render(makeRun());
    click(byId(container, 'runner-step-2-2'));
    expect(currentSteps(container)).toEqual(['runner-step-2-2']);
  });

  test('stays distinguishable from a deep-linked bug highlight on the same step', async () => {
    const linkedBug = { id: 'b1', title: 'Promo rejected', severityLabel: 'P2', severityToken: 'p2', statusLabel: 'Open', statusToken: 'open', runStepId: 's11' };
    const container = await render(makeRun(), { linkedBug });
    const li = byId(container, 'runner-step-1-1');
    expect(li.getAttribute('aria-current')).toBe('step');
    expect(li.getAttribute('data-linked-bug')).toBe('true');
    expect(li.className).toContain('ring-2');
    expect(li.className).toContain('shadow-[inset_3px_0_0_var(--accent)]');
    expect(byId(container, 'runner-step-cursor-hint').textContent).toBe('← now');
  });
});

describe('verdict keys', () => {
  test('P opens the form pre-set to Pass on the current step, focus in the note, nothing recorded', async () => {
    const container = await render(makeRun());
    await press('KeyP');
    expect(byId(container, 'runner-step-mark-confirm-1-1').textContent).toBe('Mark passed');
    expect(document.activeElement).toBe(byId(container, 'runner-step-mark-note-input-1-1'));
    expect(markCalls).toHaveLength(0);
  });

  test('a second verdict key re-picks the verdict and keeps what was typed', async () => {
    const container = await render(makeRun());
    await press('KeyP');
    setValue(byId(container, 'runner-step-mark-note-input-1-1'), 'checkout total was 49.99');
    act(() => { byId(container, 'runner-step-1-1').focus(); });
    await press('KeyF', {}, byId(container, 'runner-step-1-1'));
    expect(byId(container, 'runner-step-mark-confirm-1-1').textContent).toBe('Mark failed');
    expect((byId(container, 'runner-step-mark-note-input-1-1') as HTMLTextAreaElement).value).toBe('checkout total was 49.99');
  });

  test('typed into a text field, P, F and B are characters, not shortcuts', async () => {
    const container = await render(makeRun());
    await press('KeyP');
    const note = byId(container, 'runner-step-mark-note-input-1-1');
    await press('KeyF', {}, note);
    await press('ArrowDown', {}, note);
    expect(byId(container, 'runner-step-mark-confirm-1-1').textContent).toBe('Mark passed');
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
  });

  test('a held modifier leaves Cmd+P, Ctrl+F and Alt+B to the browser', async () => {
    const container = await render(makeRun());
    for (const [code, init] of [['KeyP', { metaKey: true }], ['KeyF', { ctrlKey: true }], ['KeyB', { altKey: true }]] as const) {
      await press(code, init);
    }
    expect(maybe(container, 'runner-step-mark-form-1-1')).toBeNull();
  });

  test('inert on a closed Run and for an actor who may not record results, and says why', async () => {
    const closed = await render(makeRun({ status: 'aborted' }));
    await press('KeyP');
    expect(maybe(closed, 'runner-step-mark-form-1-1')).toBeNull();
    expect(toasts).toEqual([RUN_STEP_MARKING_CLOSED_MESSAGE]);
    expect(byId(closed, 'runner-shortcut-legend').textContent).not.toContain('pass');
    act(() => mounted.pop()!.root.unmount());

    toasts.length = 0;
    const viewer = await render(makeRun(), { canMark: false });
    await press('KeyP');
    expect(maybe(viewer, 'runner-step-mark-form-1-1')).toBeNull();
    expect(toasts).toEqual([MARK_NOT_ALLOWED_MESSAGE]);
  });

  test('re-marking a judged step pre-fills its note and evidence link, by key and by mouse', async () => {
    const steps = { s11: { status: 'failed' as const, note: 'Payment fails on submit', evidence_url: 'https://build/p4-fail.png' } };
    const container = await render(makeRun({ steps }));
    expect(currentSteps(container)).toEqual(['runner-step-1-2']);
    await press('ArrowUp');
    await press('KeyB');
    expect((byId(container, 'runner-step-mark-note-input-1-1') as HTMLTextAreaElement).value).toBe('Payment fails on submit');
    expect((byId(container, 'runner-step-mark-evidence-input-1-1') as HTMLInputElement).value).toBe('https://build/p4-fail.png');
    click(byId(container, 'runner-step-mark-cancel-1-1'));
    click(byId(container, 'runner-step-mark-block-1-1'));
    expect((byId(container, 'runner-step-mark-note-input-1-1') as HTMLTextAreaElement).value).toBe('Payment fails on submit');

    await press('Enter', MOD);
    expect(markCalls).toEqual([{ stepId: 's11', body: { status: 'blocked', note: 'Payment fails on submit', evidence_url: 'https://build/p4-fail.png' } }]);
  });

  test('a step with nothing recorded opens an empty form', async () => {
    const container = await render(makeRun({ steps: { s11: { status: 'passed' } } }));
    await press('ArrowUp');
    await press('KeyF');
    expect((byId(container, 'runner-step-mark-note-input-1-1') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('Ctrl/Cmd+Enter', () => {
  test('with no form open, moves to the next step in order and records nothing; a bare Enter does nothing', async () => {
    const container = await render(makeRun());
    await press('Enter');
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
    await press('Enter', MOD);
    expect(currentSteps(container)).toEqual(['runner-step-1-2']);
    expect(markCalls).toHaveLength(0);
  });

  test('is a no-op on the last step of the last ATC: no wrap, the Run is not finished', async () => {
    const container = await render(makeRun());
    click(byId(container, 'runner-step-2-3'));
    await press('Enter', MOD);
    expect(currentSteps(container)).toEqual(['runner-step-2-3']);
    expect(byId(container, 'runner-status').textContent).toBe('running');
  });

  test('inside the note field, commits the form without a line break and the cursor advances', async () => {
    const container = await render(makeRun());
    await press('KeyP');
    const note = byId(container, 'runner-step-mark-note-input-1-1');
    let defaultPrevented = false;
    act(() => {
      const event = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true, ...MOD });
      note.dispatchEvent(event);
      defaultPrevented = event.defaultPrevented;
    });
    await flush();
    expect(defaultPrevented).toBe(true);
    expect(markCalls).toEqual([{ stepId: 's11', body: { status: 'passed', note: '', evidence_url: '' } }]);
    expect(maybe(container, 'runner-step-mark-form-1-1')).toBeNull();
    expect(currentSteps(container)).toEqual(['runner-step-1-2']);
  });

  test('commits the step that owns the open form, not the step under the cursor', async () => {
    const container = await render(makeRun());
    await press('KeyP');
    click(byId(container, 'runner-step-1-3'));
    expect(maybe(container, 'runner-step-mark-form-1-1')).not.toBeNull();
    await press('Enter', MOD, byId(container, 'runner-step-1-3'));
    expect(markCalls.map(c => c.stepId)).toEqual(['s11']);
    expect(currentSteps(container)).toEqual(['runner-step-1-2']);
  });

  test('stops on the last step after committing it', async () => {
    const container = await render(makeRun());
    click(byId(container, 'runner-step-2-3'));
    await press('KeyP');
    await press('Enter', MOD, byId(container, 'runner-step-mark-note-input-2-3'));
    expect(markCalls.map(c => c.stepId)).toEqual(['s23']);
    expect(currentSteps(container)).toEqual(['runner-step-2-3']);
  });

  test('a failed save keeps the form open and the cursor still', async () => {
    markResponse = () => json({ error: { message: 'This run is already closed and cannot accept new step results.' } }, 409);
    const container = await render(makeRun());
    await press('KeyP');
    await press('Enter', MOD, byId(container, 'runner-step-mark-note-input-1-1'));
    expect(byId(container, 'runner-step-mark-error-1-1').textContent).toBe('This run is already closed and cannot accept new step results.');
    expect(maybe(container, 'runner-step-mark-form-1-1')).not.toBeNull();
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
  });

  test('ignores input-method composition and a held key', async () => {
    const container = await render(makeRun());
    await press('Enter', { ...MOD, isComposing: true });
    await press('Enter', { ...MOD, repeat: true });
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
  });

  test('is inert in the abort reason field', async () => {
    const container = await render(makeRun());
    click(byId(container, 'runner-abort-button'));
    await press('Enter', MOD, byId(container, 'runner-abort-reason-input'));
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
    expect(maybe(container, 'runner-abort-modal')).not.toBeNull();
  });
});

describe('overlays claim the keyboard', () => {
  test('nothing fires while the abort or finish confirmation is open', async () => {
    const container = await render(makeRun());
    for (const opener of ['runner-abort-button', 'runner-finish-button']) {
      click(byId(container, opener));
      act(() => { (document.activeElement as HTMLElement | null)?.blur(); });
      await press('KeyP');
      await press('ArrowDown');
      await press('Enter', MOD);
      expect(maybe(container, 'runner-step-mark-form-1-1')).toBeNull();
      expect(currentSteps(container)).toEqual(['runner-step-1-1']);
      click(byId(container, opener === 'runner-abort-button' ? 'runner-abort-cancel' : 'runner-finish-cancel'));
    }
    await press('KeyP');
    expect(maybe(container, 'runner-step-mark-form-1-1')).not.toBeNull();
  });

  test('nothing fires while any other modal surface is open, such as the command palette', async () => {
    const container = await render(makeRun());
    const palette = document.createElement('div');
    palette.setAttribute('role', 'dialog');
    document.body.appendChild(palette);
    await press('KeyP');
    await press('ArrowDown');
    expect(maybe(container, 'runner-step-mark-form-1-1')).toBeNull();
    expect(currentSteps(container)).toEqual(['runner-step-1-1']);
    palette.remove();
    await press('KeyP');
    expect(maybe(container, 'runner-step-mark-form-1-1')).not.toBeNull();
  });
});

describe('Ctrl/Cmd+B and the severity keys', () => {
  test('refused on a step that is not failed, with a short reason', async () => {
    const container = await render(makeRun());
    await press('KeyB', MOD);
    expect(maybe(container, 'bug-form-modal')).toBeNull();
    expect(toasts).toEqual([REPORT_BUG_NOT_FAILED_MESSAGE]);
  });

  test('refused when the actor may not report bugs', async () => {
    const container = await render(makeRun({ steps: { s11: { status: 'failed' } } }), { canReportBug: false });
    await press('ArrowUp');
    await press('KeyB', MOD);
    expect(maybe(container, 'bug-form-modal')).toBeNull();
    expect(toasts).toHaveLength(1);
  });

  test('opens the dialog on a failed step, even on a closed Run; digits in the title stay text, outside it they set severity', async () => {
    const container = await render(makeRun({ status: 'failed', steps: { s12: { status: 'failed' } } }));
    click(byId(container, 'runner-step-1-2'));
    await press('KeyB', MOD);
    const dialog = byId(container, 'bug-form-modal');
    expect((byId(container, 'bug-steps-input') as HTMLTextAreaElement).value).toContain('ATC 1 step 2');
    expect(byId(container, 'bug-severity-P3').getAttribute('aria-pressed')).toBe('true');

    await press('Digit4', {}, byId(container, 'bug-title-input'));
    expect(byId(container, 'bug-severity-P3').getAttribute('aria-pressed')).toBe('true');

    await press('Digit2', {}, dialog);
    expect(byId(container, 'bug-severity-P2').getAttribute('aria-pressed')).toBe('true');
    await press('Digit5', {}, dialog);
    expect(byId(container, 'bug-severity-P2').getAttribute('aria-pressed')).toBe('true');
    expect(byId(container, 'bug-severity-P1').textContent).toContain('1');

    await press('KeyB', MOD, dialog);
    expect(container.querySelectorAll('[data-testid="bug-form-modal"]')).toHaveLength(1);
  });
});

describe('discoverability', () => {
  test('the current step\'s verdict controls carry their key badges and the legend names every binding', async () => {
    const container = await render(makeRun());
    expect(byId(container, 'runner-step-mark-pass-1-1').querySelector('.kbd')?.textContent).toBe('P');
    expect(byId(container, 'runner-step-mark-fail-1-1').querySelector('.kbd')?.textContent).toBe('F');
    expect(byId(container, 'runner-step-mark-block-1-1').querySelector('.kbd')?.textContent).toBe('B');
    expect(byId(container, 'runner-step-mark-pass-1-2').querySelector('.kbd')).toBeNull();
    const legend = byId(container, 'runner-shortcut-legend').textContent ?? '';
    const mod = IS_MAC ? '⌘' : 'Ctrl';
    for (const part of ['Ppass', 'Ffail', 'Bblock', `${mod}↵next step`, `${mod}Bbug`, '↑↓step']) {
      expect(legend).toContain(part);
    }
  });
});
