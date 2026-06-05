import type { NextRequest } from 'next/server';
import { criterionTitleMessage, mapCriterionRpcError } from '@lib/acceptance-criteria/errors';
import { criterionTitleError, MAX_CRITERION_DESCRIPTION_BYTES } from '@lib/acceptance-criteria/validation';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { byteLength } from '@lib/markdown/format';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/user-stories/{id}/acceptance-criteria — add a criterion to the
//   story. The position rebalance (shift active siblings down) runs atomically
//   inside the SECURITY DEFINER function bunkai_insert_acceptance_criterion;
//   omitting `position` appends at the tail.
// GET  /api/v1/user-stories/{id}/acceptance-criteria — list active criteria in
//   position order.
//
// HYBRID error model (mirrors BK-14): body-rule failures keep the house `code`
// and carry a granular `details.reason`. The Markdown detail is sanitized on
// save (BK-16). An explicit RLS-scoped existence read keeps an outsider at 404
// while a member-less viewer hits the function's 403.

const AC_COLUMNS = 'id, user_story_id, title, description, position, created_at, archived_at';

const CreateBodySchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  position: z.number().int().positive().optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const userStoryId = extractUserStoryId(request);
  if (!isUuid(userStoryId)) {
    throw new ApiError('bad_request', 'User story id must be a UUID.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { title, description, position } = CreateBodySchema.parse(payload);

  const titleReason = criterionTitleError(title);
  if (titleReason) {
    throw new ApiError('validation_failed', criterionTitleMessage(titleReason), {
      details: { reason: titleReason },
    });
  }

  if (description != null && byteLength(description) > MAX_CRITERION_DESCRIPTION_BYTES) {
    throw new ApiError('validation_failed', 'Detail must be at most 50 KB.', {
      details: { reason: 'description_too_long' },
    });
  }

  // Existence (404). RLS scopes the read to stories the caller can see, so an
  // outsider reads as not found; an in-workspace viewer passes here and is
  // stopped by the function's role gate (403) instead.
  const { data: story, error: storyError } = await supabase
    .from('user_stories')
    .select('id')
    .eq('id', userStoryId)
    .is('archived_at', null)
    .maybeSingle();
  if (storyError) {
    throw new ApiError('internal_error', storyError.message);
  }
  if (!story) {
    throw new ApiError('not_found', 'User story not found.');
  }

  // Omit null args — Supabase types text/int params as non-nullable, so the SQL
  // DEFAULT NULL only applies when the key is absent.
  const rpcArgs: {
    p_user_story_id: string
    p_title: string
    p_description?: string
    p_position?: number
  } = { p_user_story_id: userStoryId, p_title: title.trim() };
  if (description != null) {
    rpcArgs.p_description = sanitizeMarkdown(description);
  }
  if (position != null) {
    rpcArgs.p_position = position;
  }

  const { data, error } = await supabase.rpc('bunkai_insert_acceptance_criterion', rpcArgs);
  if (error) {
    mapCriterionRpcError(error, 'User story not found.');
  }

  return jsonResponse({ acceptance_criterion: data }, { status: 201 });
});

export const GET = withApiHandler(async (request: NextRequest) => {
  const userStoryId = extractUserStoryId(request);
  if (!isUuid(userStoryId)) {
    throw new ApiError('bad_request', 'User story id must be a UUID.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const { data, error } = await supabase
    .from('acceptance_criteria')
    .select(AC_COLUMNS)
    .eq('user_story_id', userStoryId)
    .is('archived_at', null)
    .order('position', { ascending: true });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ acceptance_criteria: data ?? [] }, { status: 200 });
});

function extractUserStoryId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const idx = segments.lastIndexOf('user-stories');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
