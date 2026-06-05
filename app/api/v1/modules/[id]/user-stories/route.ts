import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { byteLength } from '@lib/markdown/format';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { createClient } from '@lib/supabase/server';
import { mapStoryWriteError, titleMessage } from '@lib/user-stories/errors';
import { jiraKeyError, MAX_STORY_DESCRIPTION_BYTES, normalizeJiraKey, storyTitleError } from '@lib/user-stories/validation';
import { z } from 'zod';

// POST /api/v1/modules/{id}/user-stories — create a User Story anchored to the
//   module. Member-only (RLS on user_stories joins module -> project -> members).
// GET  /api/v1/modules/{id}/user-stories — list the module's active stories.
//
// HYBRID error model (mirrors the module routes): body-rule failures keep the
// house `code` and carry a granular `details.reason`. The Markdown description
// is sanitized on save (BK-16); the Jira key (external_id) is validated, upper-
// cased, and unique per project (case-insensitive) via a partial unique index.

const CreateBodySchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  external_id: z.string().nullable().optional(),
});

const STORY_COLUMNS = 'id, module_id, project_id, title, description, external_id, external_url, created_at, archived_at';

export const POST = withApiHandler(async (request: NextRequest) => {
  const moduleId = extractModuleId(request);
  if (!isUuid(moduleId)) {
    throw new ApiError('bad_request', 'Module id must be a UUID.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { title, description, external_id } = CreateBodySchema.parse(payload);

  const titleReason = storyTitleError(title);
  if (titleReason) {
    throw new ApiError('validation_failed', titleMessage(titleReason), { details: { reason: titleReason } });
  }

  if (description != null && byteLength(description) > MAX_STORY_DESCRIPTION_BYTES) {
    throw new ApiError('validation_failed', 'Description must be at most 50 KB.', {
      details: { reason: 'description_too_long' },
    });
  }

  let normalizedKey: string | null = null;
  if (external_id != null && external_id.trim().length > 0) {
    const keyReason = jiraKeyError(external_id);
    if (keyReason) {
      throw new ApiError('validation_failed', 'The Jira key must read as LETTERS-NUMBER, e.g. BK-42.', {
        details: { reason: keyReason },
      });
    }
    normalizedKey = normalizeJiraKey(external_id);
  }

  // The module supplies the denormalized project_id and confirms existence; RLS
  // scopes the read so a non-visible module reads as not found.
  const { data: module, error: moduleError } = await supabase
    .from('modules')
    .select('id, project_id')
    .eq('id', moduleId)
    .is('archived_at', null)
    .maybeSingle();
  if (moduleError) {
    throw new ApiError('internal_error', moduleError.message);
  }
  if (!module) {
    throw new ApiError('not_found', 'Module not found.');
  }

  const { data, error } = await supabase
    .from('user_stories')
    .insert({
      module_id: moduleId,
      project_id: module.project_id,
      title: title.trim(),
      description: description != null ? sanitizeMarkdown(description) : null,
      external_id: normalizedKey,
    })
    .select(STORY_COLUMNS)
    .single();

  if (error) {
    mapStoryWriteError(error);
  }

  return jsonResponse({ user_story: data }, { status: 201 });
});

export const GET = withApiHandler(async (request: NextRequest) => {
  const moduleId = extractModuleId(request);
  if (!isUuid(moduleId)) {
    throw new ApiError('bad_request', 'Module id must be a UUID.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const { data, error } = await supabase
    .from('user_stories')
    .select(STORY_COLUMNS)
    .eq('module_id', moduleId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ user_stories: data ?? [] }, { status: 200 });
});

function extractModuleId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const idx = segments.lastIndexOf('modules');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
