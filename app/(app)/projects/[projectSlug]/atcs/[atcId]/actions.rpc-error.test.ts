import type { SaveAtcActionInput } from './actions';
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

// BK-886 — saveAtcAction returned `error.message` from bunkai_update_atc
// verbatim, so a CHECK violation reached the editor toast as raw Postgres text
// (`new row for relation "atcs" violates check constraint "..."`). The fix
// routes the error through mapAtcRpcError, the same mapper the headless PATCH
// route uses.
//
// Why the client is swapped through a global instead of mocked directly:
// bun's `mock.module` is process-wide, and the sibling `actions.test.ts`
// mocks `@lib/supabase/server` with a stub that must THROW when reached (its
// boundary test relies on that). This file installs a mock that behaves the
// same way (throws with the same text) unless a fake client is set, and
// clears it afterwards, so whichever mock wins the race both files stay green.
const CLIENT_KEY = '__bk886FakeSupabaseClient';
const globals = globalThis as Record<string, unknown>;

void mock.module('server-only', () => ({}));
void mock.module('@lib/supabase/server', () => ({
  createClient: async () => {
    const client = globals[CLIENT_KEY];
    if (!client) {
      throw new Error('createClient() reached — the tags-cap guard should have returned before this point');
    }
    return client;
  },
}));

const { saveAtcAction } = await import('./actions');

const RAW_DB_MARKERS = ['violates check constraint', 'relation "atcs"', 'atcs_'];

function useRpcError(error: { code?: string, message: string }): void {
  globals[CLIENT_KEY] = {
    auth: { getUser: async () => ({ data: { user: { id: '44444444-4444-4444-8444-444444444444' } } }) },
    rpc: async () => ({ data: null, error }),
  };
}

function checkViolation(constraint: string) {
  return {
    code: '23514',
    message: `new row for relation "atcs" violates check constraint "${constraint}"`,
  };
}

function baseInput(): SaveAtcActionInput {
  return {
    atcId: '11111111-1111-4111-8111-111111111111',
    projectSlug: 'demo-project',
    title: 'A valid ATC title',
    layer: 'UI',
    technique: null,
    priority: null,
    tags: [],
    userStoryId: '22222222-2222-4222-8222-222222222222',
    stepsMarkdown: '1. Do the thing',
    assertionsYaml: '- the thing happened',
    acIds: ['33333333-3333-4333-8333-333333333333'],
  };
}

async function saveError(): Promise<string> {
  const result = await saveAtcAction(baseInput());
  if (result.ok) {
    throw new Error('expected saveAtcAction to fail');
  }
  return result.error;
}

function expectNoRawDbText(message: string): void {
  for (const marker of RAW_DB_MARKERS) {
    expect(message).not.toContain(marker);
  }
}

afterEach(() => {
  delete globals[CLIENT_KEY];
});

afterAll(() => {
  delete globals[CLIENT_KEY];
});

describe('saveAtcAction — RPC error mapping (BK-886)', () => {
  test('title CHECK → curated title message, no raw constraint text', async () => {
    useRpcError(checkViolation('atcs_title_min_length'));
    const message = await saveError();
    expect(message).toBe('Title must be at least 3 characters after trimming leading/trailing whitespace.');
    expectNoRawDbText(message);
  });

  test('technique CHECK → curated technique message', async () => {
    useRpcError(checkViolation('atcs_technique_allowed'));
    const message = await saveError();
    expect(message).toStartWith('Technique must be one of:');
    expectNoRawDbText(message);
  });

  test('priority CHECK → curated priority message', async () => {
    useRpcError(checkViolation('atcs_priority_allowed'));
    const message = await saveError();
    expect(message).toBe('Priority must be one of: Critical, High, Medium, Low.');
    expectNoRawDbText(message);
  });

  test('layer CHECK (auto-named atcs_layer_check) → curated layer message', async () => {
    useRpcError(checkViolation('atcs_layer_check'));
    const message = await saveError();
    expect(message).toBe('Layer must be one of: UI, API, Unit.');
    expectNoRawDbText(message);
  });

  test('unrecognized CHECK → generic validation message, constraint name hidden', async () => {
    useRpcError(checkViolation('atcs_some_future_rule'));
    const message = await saveError();
    expect(message).toBe('The request failed a database validation rule.');
    expectNoRawDbText(message);
  });

  test('mapped domain error (version conflict) keeps its curated message', async () => {
    useRpcError({ code: '45022', message: 'version_conflict:7' });
    const message = await saveError();
    expect(message).toBe('The ATC was modified by another request.');
  });

  test('unknown SQLSTATE → generic save message, raw DB text never returned', async () => {
    const spy = mock(() => {});
    const original = console.error;
    console.error = spy;
    try {
      useRpcError({ code: 'XX000', message: 'duplicate key value violates unique constraint "atcs_pkey"' });
      const message = await saveError();
      expect(message).toBe('Could not save the ATC. Try again in a moment.');
      expect(message).not.toContain('violates');
      expect(message).not.toContain('atcs_pkey');
      expect(spy).toHaveBeenCalledTimes(1);
    }
    finally {
      console.error = original;
    }
  });

  test('error without a code → generic save message', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      useRpcError({ message: 'fetch failed: connect ECONNREFUSED' });
      expect(await saveError()).toBe('Could not save the ATC. Try again in a moment.');
    }
    finally {
      console.error = original;
    }
  });
});
