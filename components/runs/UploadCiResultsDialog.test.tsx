import type { UploadPreview } from '@lib/runs/ci-upload';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workbench = { tests: [{ id: 't-1', title: 'Checkout happy path' }], environments: [{ id: 'e-1', name: 'Staging' }], canCreate: true, readOnly: false };
void mock.module('@app/(app)/projects/[projectSlug]/workbench-context', () => ({ useWorkbench: () => workbench }));
void mock.module('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { UploadCiResultsDialog, UPLOAD_MAX_BYTES, verdictReason } = await import('./UploadCiResultsDialog');
const { UploadCiResultsButton } = await import('./UploadCiResultsButton');

const TEST_ID = '11111111-1111-4111-8111-111111111111';

function entry(index: number, outcome: 'passed' | 'failed' | 'errored' | 'skipped', name = `case ${index}`) {
  const result = outcome === 'passed' ? 'pass' : outcome === 'skipped' ? 'block' : 'fail';
  return { index, name, classname: 'suite', result, outcome, message: null } as const;
}

const PREVIEW: UploadPreview = {
  test: { id: TEST_ID, title: 'Checkout happy path' },
  environment: 'Staging',
  file_name: 'junit.xml',
  entry_count: 3,
  step_count: 1,
  mapped: [{ position: 1, step_title: 'Add item to cart', entry: entry(1, 'failed', '<img src=x onerror=alert(1)>') }],
  gaps: [],
  unmapped: [entry(2, 'passed'), entry(3, 'skipped')],
  verdict: 'failed',
  totals: { passed: 0, failed: 1, skipped: 0, gaps: 0, unmapped: 2 },
  duration_seconds: 2,
  requires_acknowledgement: true,
  fingerprint: 'f'.repeat(64),
};

interface Call { url: string, init: RequestInit }
let calls: Call[] = [];
let responses: Array<{ status: number, body: unknown }> = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  responses = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

let mounted: Array<{ container: HTMLElement, root: { unmount: () => void } }> = [];
afterEach(() => {
  mounted.forEach(({ container, root }) => { act(() => { root.unmount(); }); container.remove(); });
  mounted = [];
  globalThis.fetch = realFetch;
});

function render(element: ReturnType<typeof createElement>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  mounted.push({ container, root });
}

function mountDialog(onCreated: (id: string) => void = () => {}) {
  render(createElement(UploadCiResultsDialog, {
    open: true,
    onOpenChange: () => {},
    tests: workbench.tests,
    environments: workbench.environments,
    onCreated,
  }));
}

const id = (testId: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

function choose(testId: string, value: string) {
  const select = id(testId) as unknown as HTMLSelectElement;
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function pickFile(file: File) {
  const input = id('ci-upload-input') as unknown as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function click(testId: string) {
  await act(async () => {
    id(testId)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

const xmlFile = () => new File(['<testsuite><testcase name="a"/></testsuite>'], 'junit.xml', { type: 'text/xml' });

describe('UploadCiResultsDialog', () => {
  test('step 1 asks for a Test and an environment and names the format and the limit', () => {
    mountDialog();
    expect(id('ci-upload-dialog')?.getAttribute('data-step')).toBe('file');
    expect(id('ci-upload-hint')?.textContent).toBe('Choose a Test and an environment, then add the report.');
    expect(id('ci-upload-dropzone')?.textContent).toContain('JUnit XML · one file per upload · 10 MB max');
  });

  test('refuses a file over 10 MB before sending anything (Scenario 4.1)', async () => {
    mountDialog();
    choose('ci-upload-test', 't-1');
    choose('ci-upload-env', 'Staging');
    const big = new File(['x'], 'results.pdf');
    Object.defineProperty(big, 'size', { value: UPLOAD_MAX_BYTES + 1 });
    await pickFile(big);
    expect(calls).toHaveLength(0);
    const error = id('ci-upload-error')?.textContent ?? '';
    expect(error).toContain('File too large.');
    expect(error).toContain('10 MB');
    expect(error).toContain('JUnit XML');
  });

  test('shows the server rejection inline and stays on step 1 (Scenarios 2.3, 4.3)', async () => {
    mountDialog();
    choose('ci-upload-test', 't-1');
    choose('ci-upload-env', 'Staging');
    responses.push({ status: 422, body: { error: { code: 'validation_failed', message: 'The file is XML but not a JUnit report.', details: { reason: 'report_not_junit' } } } });
    await pickFile(xmlFile());
    expect(calls[0].url).toContain('/api/v1/runs/uploads/preview?');
    expect(id('ci-upload-error')?.textContent).toContain('Not a JUnit XML report.');
    expect(id('ci-upload-dialog')?.getAttribute('data-step')).toBe('file');
  });

  test('previews, gates Continue on the acknowledgement and creates the run with the confirmed preview (Scenarios 2.1, 5.1)', async () => {
    const created: string[] = [];
    mountDialog(runId => created.push(runId));
    choose('ci-upload-test', 't-1');
    choose('ci-upload-env', 'Staging');
    responses.push({ status: 200, body: { preview: PREVIEW } });
    await pickFile(xmlFile());

    const preview = calls[0];
    expect((preview.init.headers as Record<string, string>)['content-type']).toBe('application/gzip');
    expect(new URL(preview.url, 'http://x').searchParams.get('test_id')).toBe('t-1');
    expect(id('ci-upload-dialog')?.getAttribute('data-step')).toBe('map');
    expect(id('ci-upload-row-1')?.textContent).toContain('Add item to cart');
    expect(id('ci-upload-row-1')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(id('ci-upload-dialog')?.querySelector('img')).toBeNull();
    expect(id('ci-upload-unmapped-2')).not.toBeNull();
    expect(id('ci-upload-unmapped-3')?.textContent).toContain('skipped');
    expect((id('ci-upload-continue') as HTMLButtonElement).disabled).toBe(true);

    await click('ci-upload-ack');
    expect((id('ci-upload-continue') as HTMLButtonElement).disabled).toBe(false);
    await click('ci-upload-continue');
    expect(id('ci-upload-verdict')?.getAttribute('data-verdict')).toBe('failed');
    expect(id('ci-upload-verdict-reason')?.textContent).toBe('1 failed entry. A run is recorded as passed only when every step passed.');
    expect(id('ci-upload-stat-unmapped')?.textContent).toBe('2');

    responses.push({ status: 201, body: { run: { id: 'run-9' } } });
    await click('ci-upload-create');
    const create = new URL(calls[1].url, 'http://x');
    expect(create.pathname).toBe('/api/v1/runs/uploads');
    expect(create.searchParams.get('acknowledge_unmapped')).toBe('true');
    expect(create.searchParams.get('preview_fingerprint')).toBe(PREVIEW.fingerprint);
    expect(create.searchParams.get('idempotency_key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(created).toEqual(['run-9']);
  });

  test('a lost response keeps the idempotency key so the retry cannot create a second run', async () => {
    mountDialog();
    choose('ci-upload-test', 't-1');
    choose('ci-upload-env', 'Staging');
    responses.push({ status: 200, body: { preview: { ...PREVIEW, unmapped: [], requires_acknowledgement: false } } });
    await pickFile(xmlFile());
    await click('ci-upload-continue');
    responses.push({ status: 502, body: {} });
    await click('ci-upload-create');
    responses.push({ status: 200, body: { run: { id: 'run-1', replayed: true } } });
    await click('ci-upload-create');
    const keys = calls.slice(1).map(call => new URL(call.url, 'http://x').searchParams.get('idempotency_key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test('keeps the confirm step and shows the server message when the create fails', async () => {
    mountDialog();
    choose('ci-upload-test', 't-1');
    choose('ci-upload-env', 'Staging');
    responses.push({ status: 200, body: { preview: { ...PREVIEW, unmapped: [], requires_acknowledgement: false } } });
    await pickFile(xmlFile());
    await click('ci-upload-continue');
    responses.push({ status: 409, body: { error: { message: 'The Test or the report changed after the preview.' } } });
    await click('ci-upload-create');
    expect(id('ci-upload-create-error')?.textContent).toBe('The Test or the report changed after the preview.');
    expect(id('ci-upload-dialog')?.getAttribute('data-step')).toBe('confirm');
  });
});

describe('verdictReason', () => {
  test('names failed, skipped and uncovered steps, and the passing case', () => {
    expect(verdictReason({ ...PREVIEW, verdict: 'passed' })).toBe('Every Test step has a passing entry.');
    expect(verdictReason({ ...PREVIEW, totals: { passed: 0, failed: 2, skipped: 1, gaps: 3, unmapped: 0 } }))
      .toBe('2 failed entries, 1 skipped entry, 3 steps with no result. A run is recorded as passed only when every step passed.');
  });
});

describe('UploadCiResultsButton', () => {
  test('is absent for a viewer and disabled on a read-only project (Scenario E1)', () => {
    workbench.canCreate = false;
    render(createElement(UploadCiResultsButton, { onCreated: () => {} }));
    expect(id('ci-upload-open')).toBeNull();
    workbench.canCreate = true;
    workbench.readOnly = true;
    render(createElement(UploadCiResultsButton, { onCreated: () => {} }));
    expect((id('ci-upload-open') as HTMLButtonElement).disabled).toBe(true);
    workbench.readOnly = false;
  });
});
