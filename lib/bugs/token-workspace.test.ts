import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, test } from 'bun:test';
import { assertBugTokenWorkspace } from './token-workspace';

const BUG = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

function db(result: { data: { workspace_id: string } | null, error: { message: string } | null }) {
  const reads: string[] = [];
  return {
    reads,
    client: {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: (column: string, value: string) => {
            reads.push(`${table}.${columns} ${column}=${value}`);
            return { maybeSingle: async () => result };
          },
        }),
      }),
    },
  };
}

function principal(via: 'cookie' | 'bearer', workspaceId: string | null, fake: ReturnType<typeof db>) {
  return { via, workspaceId, db: fake.client } as never;
}

async function failure(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  }
  catch (error) {
    if (error instanceof ApiError) { return error; }
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('assertBugTokenWorkspace', () => {
  test('a cookie session and an unscoped token pass without reading the Bug', async () => {
    for (const p of [['cookie', null], ['bearer', null]] as const) {
      const fake = db({ data: { workspace_id: OTHER }, error: null });
      await assertBugTokenWorkspace(principal(p[0], p[1], fake), BUG);
      expect(fake.reads).toEqual([]);
    }
  });

  test('a token of the Bug workspace passes, whatever the case of the id', async () => {
    const fake = db({ data: { workspace_id: WORKSPACE }, error: null });
    await assertBugTokenWorkspace(principal('bearer', WORKSPACE.toUpperCase(), fake), BUG);
    expect(fake.reads).toEqual([`bugs.workspace_id id=${BUG}`]);
  });

  test('a token of another workspace is 403 token_workspace_mismatch', async () => {
    const error = await failure(async () => assertBugTokenWorkspace(principal('bearer', WORKSPACE, db({ data: { workspace_id: OTHER }, error: null })), BUG));
    expect([error.status, error.code, error.details]).toEqual([403, 'forbidden', { reason: 'token_workspace_mismatch' }]);
  });

  test('a Bug the caller cannot see is the generic Bug 404', async () => {
    const error = await failure(async () => assertBugTokenWorkspace(principal('bearer', WORKSPACE, db({ data: null, error: null })), BUG));
    expect([error.status, error.code, error.message, error.details]).toEqual([404, 'not_found', 'Bug not found.', { reason: 'not_found' }]);
  });

  test('a failed read is a generic 500 without the raw text', async () => {
    const error = await failure(async () => assertBugTokenWorkspace(principal('bearer', WORKSPACE, db({ data: null, error: { message: 'relation secret does not exist' } })), BUG));
    expect([error.status, error.message]).toEqual([500, 'Failed to resolve the Bug.']);
  });
});
