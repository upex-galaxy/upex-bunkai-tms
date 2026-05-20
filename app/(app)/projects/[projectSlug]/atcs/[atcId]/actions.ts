'use server';

import { parseAssertionsYaml, parseStepsMarkdown } from '@lib/atc-parse';
import { saveAtc } from '@lib/supabase/rpc';
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
  = | { ok: true }
    | { ok: false, error: string };

export async function saveAtcAction(input: SaveAtcActionInput): Promise<SaveAtcActionResult> {
  if (!input.userStoryId) {
    return { ok: false, error: 'Bind to a user story before saving.' };
  }
  if (input.acIds.length === 0) {
    return { ok: false, error: 'Bind at least one acceptance criterion.' };
  }
  if (input.title.trim().length === 0) {
    return { ok: false, error: 'Title is required.' };
  }

  const supabase = await createClient();
  const { error } = await saveAtc(supabase, {
    atcId: input.atcId,
    title: input.title.trim(),
    layer: input.layer,
    tags: input.tags,
    userStoryId: input.userStoryId,
    steps: parseStepsMarkdown(input.stepsMarkdown),
    assertions: parseAssertionsYaml(input.assertionsYaml),
    acIds: input.acIds,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projects/${input.projectSlug}/atcs/${input.atcId}`);
  revalidatePath(`/projects/${input.projectSlug}`);
  return { ok: true };
}
