import { TITLE_MESSAGE } from '@lib/atcs/builder-guards';
import { describe, expect, mock, test } from 'bun:test';

// actions.ts imports `@lib/supabase/server` -> `@lib/env`, which pulls in
// `server-only`; shim it so the module graph loads under Bun, then import the
// testable export. Same convention as app/api/v1/bugs/route.test.ts /
// app/api/v1/runs/route.test.ts / lib/jira/import-runner.test.ts.
void mock.module('server-only', () => ({}));
const { saveAtcAction } = await import('./actions');

// BK-145 — the web editor's save path (this exact `saveAtcAction` server
// action, called by `components/atcs/AtcEditor.tsx`'s `handleSave`) called
// `bunkai_update_atc` directly and never enforced the BK-18 title bounds
// (3-200 chars) the create flow and the headless PATCH /api/v1/atcs/{id}
// route already apply via `AtcUpdateBodySchema`. A 1-2 char title saved
// silently with no error at any layer (QA-confirmed regression, 2026-07-06).
//
// This test calls the REAL exported `saveAtcAction` — not a mock — with the
// exact input shape `AtcEditor.handleSave` builds. The title guard is the
// first check that can fail without touching Supabase (userStoryId/acIds are
// valid here), so no auth/RPC mocking is needed: the fix must make the
// function return before it ever reaches `createClient()`.

const baseInput = {
  atcId: 'atc-1',
  projectSlug: 'proj-1',
  layer: 'UI',
  tags: [] as string[],
  userStoryId: 'story-1',
  stepsMarkdown: '01. do a thing',
  assertionsYaml: '- it works',
  acIds: ['ac-1'],
};

describe('saveAtcAction (BK-145 — title minimum length)', () => {
  test('rejects a 2-character title with the shared TITLE_MESSAGE, without touching Supabase', async () => {
    const result = await saveAtcAction({ ...baseInput, title: 'ab' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(TITLE_MESSAGE);
    }
  });

  test('rejects a whitespace-only title the same way (trim before measuring)', async () => {
    const result = await saveAtcAction({ ...baseInput, title: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(TITLE_MESSAGE);
    }
  });

  test('rejects a title over the 200-char maximum', async () => {
    const result = await saveAtcAction({ ...baseInput, title: 'x'.repeat(201) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(TITLE_MESSAGE);
    }
  });
});
