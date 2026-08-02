import type { SaveAtcActionInput } from './actions';
import { TAG_CAP_MESSAGE } from '@lib/atcs/builder-guards';
import { describe, expect, mock, test } from 'bun:test';

// BK-144 — regression test for the ATC tag cap.
//
// The web editor's `saveAtcAction` server action calls `bunkai_update_atc`
// directly via the `updateAtc()` RPC wrapper and does NOT go through the
// `AtcWriteBodySchema` zod validation (`.max(MAX_ATC_TAGS)`) that the headless
// POST/PATCH /api/v1/atcs routes already enforce — so it had no tags-length
// guard of its own. Reproduces the original bug report: an ATC that already
// has 10 tags could still be saved with an 11th.
//
// `actions.ts` imports `createClient` from `@lib/supabase/server`, which
// imports `@lib/env` (`import 'server-only'`) — a load-time guard that throws
// when evaluated outside Next.js's bundler. No test in this repo imports that
// chain today (see lib/atcs/duplicate-rpc.test.ts and siblings, which build
// their own `@supabase/supabase-js` client instead of importing
// `@lib/supabase/server`/`admin`, for exactly this reason). To exercise the
// REAL `saveAtcAction` — not a re-implementation of its guard — this file
// module-mocks `@lib/supabase/server` to a stub that throws if it is ever
// actually reached. That stub also gives the boundary test (exactly 10 tags)
// an unambiguous signal: the tags guard resolves cleanly, so anything that
// gets PAST it hits the stub instead, proving the guard let a valid payload
// through rather than silently swallowing it.
void mock.module('@lib/supabase/server', () => ({
  createClient: async () => {
    throw new Error('createClient() reached — the tags-cap guard should have returned before this point');
  },
}));

const { saveAtcAction } = await import('./actions');

function baseInput(overrides: Partial<SaveAtcActionInput> = {}): SaveAtcActionInput {
  return {
    atcId: '11111111-1111-4111-8111-111111111111',
    projectSlug: 'demo-project',
    title: 'A valid ATC title',
    layer: 'UI',
    tags: [],
    userStoryId: '22222222-2222-4222-8222-222222222222',
    stepsMarkdown: '1. Do the thing',
    assertionsYaml: '- the thing happened',
    acIds: ['33333333-3333-4333-8333-333333333333'],
    ...overrides,
  };
}

describe('saveAtcAction — tags cap (BK-144)', () => {
  test('rejects saving with 11 tags, before ever reaching Supabase', async () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    const result = await saveAtcAction(baseInput({ tags }));
    expect(result).toEqual({ ok: false, error: TAG_CAP_MESSAGE });
  });

  test('rejects an even larger tag list the same way', async () => {
    const tags = Array.from({ length: 25 }, (_, i) => `tag-${i}`);
    const result = await saveAtcAction(baseInput({ tags }));
    expect(result).toEqual({ ok: false, error: TAG_CAP_MESSAGE });
  });

  test('does not reject exactly 10 tags (boundary) — the guard only fires above the cap', async () => {
    // `.rejects` matchers are unreliable in bun:test (see lib/api/idempotency.test.ts) —
    // assert on the caught error directly instead.
    const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
    try {
      await saveAtcAction(baseInput({ tags }));
      throw new Error('expected saveAtcAction to throw via the createClient stub');
    }
    catch (err) {
      expect((err as Error).message).toContain('createClient() reached');
    }
  });
});
