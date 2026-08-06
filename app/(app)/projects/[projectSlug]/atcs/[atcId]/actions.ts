'use server';

import { parseAssertionsYaml, parseStepsMarkdown } from '@lib/atc-parse';
import { TAG_CAP_MESSAGE, TITLE_MESSAGE, titleValid } from '@lib/atcs/builder-guards';
import { sanitizeAtcAssertions, sanitizeAtcSteps } from '@lib/atcs/sanitize';
import { MAX_ATC_TAGS } from '@lib/atcs/validation';
import { atcUsage, updateAtc } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface SaveAtcActionInput {
  atcId: string
  projectSlug: string
  title: string
  layer: string
  tags: string[]
  userStoryId: string
  stepsMarkdown: string
  assertionsYaml: string
  acIds: string[]
}

export type SaveAtcActionResult
  = | { ok: true, affectedTestCount: number }
    | { ok: false, error: string };

// Edit an ATC from the web editor. Unified onto the canonical bunkai_update_atc
// RPC (the same path the headless PATCH /api/v1/atcs/{id} uses) so a UI edit
// behaves identically to an API edit: it bumps the version, full-replaces the
// children, and — crucially — emits the `atc.updated` event carrying the real
// affected_test_ids (the legacy bunkai_save_atc never emitted, so UI edits were
// invisible to search reindex / future notifications). user_story_id is immutable
// on edit (the RPC ignores it; the editor locks the story selector), so only the
// title/layer/tags/steps/assertions and the AC bindings within the fixed story
// change. Optimistic locking is left off here (ifMatch null = last-write-wins),
// matching the editor's current single-user save UX.
export async function saveAtcAction(input: SaveAtcActionInput): Promise<SaveAtcActionResult> {
  if (!input.userStoryId) {
    return { ok: false, error: 'Bind to a user story before saving.' };
  }
  if (input.acIds.length === 0) {
    return { ok: false, error: 'Bind at least one acceptance criterion.' };
  }
  // BK-145 — the web editor's save path bypasses AtcUpdateBodySchema entirely
  // (it calls bunkai_update_atc directly, never the PATCH route), so it never
  // enforced the BK-18 title bounds (3-200 chars) the create flow and the
  // headless API already apply. Reuse the same guard + message so a short (or
  // overlong) title is rejected identically everywhere, instead of silently
  // saving a 1-2 char title.
  if (!titleValid(input.title)) {
    return { ok: false, error: TITLE_MESSAGE };
  }
  if (input.tags.length > MAX_ATC_TAGS) {
    return { ok: false, error: TAG_CAP_MESSAGE };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: 'Your session has expired. Sign in again.' };
  }

  const { error } = await updateAtc(supabase, {
    actorUserId: auth.user.id,
    atcId: input.atcId,
    ifMatch: null,
    title: input.title.trim(),
    layer: input.layer,
    tags: input.tags,
    steps: sanitizeAtcSteps(parseStepsMarkdown(input.stepsMarkdown)),
    assertions: sanitizeAtcAssertions(parseAssertionsYaml(input.assertionsYaml)),
    acIds: input.acIds,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projects/${input.projectSlug}/atcs/${input.atcId}`);
  revalidatePath(`/projects/${input.projectSlug}`);

  // Report how many Tests the edit propagated to. The edit just touched the ATC,
  // not test_steps, so this read reflects the chaining Tests at save time; count
  // is DISTINCT Tests (a Test chaining the ATC multiple times counts once). A
  // failure here must not fail the save — fall back to 0.
  let affectedTestCount = 0;
  const { data: usage } = await atcUsage(supabase, {
    actorUserId: auth.user.id,
    atcId: input.atcId,
  });
  if (usage) {
    affectedTestCount = (usage as { count: number }).count;
  }

  return { ok: true, affectedTestCount };
}
