import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { byteLength } from '@lib/markdown/format';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { mapStoryWriteError, titleMessage } from '@lib/user-stories/errors';
import { jiraKeyError, MAX_STORY_DESCRIPTION_BYTES, normalizeJiraKey, storyTitleError } from '@lib/user-stories/validation';
import { z } from 'zod';

// GET    /api/v1/user-stories/{id} — read one active story.
// PATCH  /api/v1/user-stories/{id} — edit title / description / Jira key.
// DELETE /api/v1/user-stories/{id} — soft-archive the story.
//
// The Jira key is immutable once set (a change returns 409). Authorization rides
// the existing user_stories RLS policies; the Markdown description is sanitized
// on save (BK-16).

const STORY_COLUMNS = 'id, module_id, project_id, title, description, external_id, external_url, status, created_at, archived_at';

const UpdateBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  external_id: z.string().nullable().optional(),
  // BK-15 ready-to-test gate: ready_to_test is blocked while the story has zero
  // active acceptance criteria.
  status: z.enum(['draft', 'ready_to_test']).optional(),
});

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const storyId = extractStoryId(request);
  if (!isUuid(storyId)) {
    throw new ApiError('bad_request', 'Story id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const { data, error } = await db
    .from('user_stories')
    .select(STORY_COLUMNS)
    .eq('id', storyId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Story not found.');
  }

  return jsonResponse({ user_story: data }, { status: 200 });
}, { auth: 'required' });

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const storyId = extractStoryId(request);
  if (!isUuid(storyId)) {
    throw new ApiError('bad_request', 'Story id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = UpdateBodySchema.parse(payload);
  const hasTitle = body.title !== undefined;
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasExternalId = Object.prototype.hasOwnProperty.call(body, 'external_id');
  const hasStatus = body.status !== undefined;
  if (!hasTitle && !hasDescription && !hasExternalId && !hasStatus) {
    throw new ApiError('validation_failed', 'Provide a field to update.', {
      details: { reason: 'no_fields' },
    });
  }

  const { data: existing, error: readError } = await db
    .from('user_stories')
    .select('id, external_id')
    .eq('id', storyId)
    .is('archived_at', null)
    .maybeSingle();
  if (readError) {
    throw new ApiError('internal_error', readError.message);
  }
  if (!existing) {
    throw new ApiError('not_found', 'Story not found.');
  }

  const update: { title?: string, description?: string | null, external_id?: string } = {};

  if (hasTitle) {
    const titleReason = storyTitleError(body.title ?? '');
    if (titleReason) {
      throw new ApiError('validation_failed', titleMessage(titleReason), { details: { reason: titleReason } });
    }
    update.title = (body.title ?? '').trim();
  }

  if (hasDescription) {
    const description = body.description ?? null;
    if (description !== null && byteLength(description) > MAX_STORY_DESCRIPTION_BYTES) {
      throw new ApiError('validation_failed', 'Description must be at most 50 KB.', {
        details: { reason: 'description_too_long' },
      });
    }
    update.description = description !== null ? sanitizeMarkdown(description) : null;
  }

  if (hasExternalId) {
    const raw = body.external_id;
    const requested = raw != null && raw.trim().length > 0 ? normalizeJiraKey(raw) : null;
    if (existing.external_id !== null) {
      // Immutable once set — only an identical value is a no-op; anything else 409.
      if (requested !== existing.external_id) {
        throw new ApiError('conflict', 'The Jira link cannot be changed once set.', {
          details: { reason: 'external_id_immutable' },
        });
      }
    }
    else if (requested !== null) {
      const keyReason = jiraKeyError(requested);
      if (keyReason) {
        throw new ApiError('validation_failed', 'The Jira key must read as LETTERS-NUMBER, e.g. BK-42.', {
          details: { reason: keyReason },
        });
      }
      update.external_id = requested;
    }
  }

  let resultRow: unknown = null;

  // Field edits (title / description / Jira key) ride the RLS-scoped update.
  if (Object.keys(update).length > 0) {
    const { data, error } = await db
      .from('user_stories')
      .update(update)
      .eq('id', storyId)
      .is('archived_at', null)
      .select(STORY_COLUMNS)
      .maybeSingle();
    if (error) {
      mapStoryWriteError(error);
    }
    if (!data) {
      // The row exists (we read it) but the RLS-scoped update touched no rows ->
      // the caller is a viewer / non-member.
      throw new ApiError('forbidden', 'You must be a member of this project.', {
        details: { reason: 'not_a_member' },
      });
    }
    resultRow = data;
  }

  // Status transition (BK-15) runs through a serialized SECURITY DEFINER setter
  // that locks the story row and re-counts active criteria under that lock, so a
  // concurrent last-criterion archive cannot strand the story in ready_to_test
  // with zero criteria. 45010 = the ready-to-test gate failed.
  if (hasStatus) {
    const { data, error } = await db.rpc('bunkai_set_user_story_status', {
      p_id: storyId,
      p_status: body.status as 'draft' | 'ready_to_test',
    });
    if (error) {
      if (error.code === '42501') {
        throw new ApiError('forbidden', 'You must be a member of this project.', {
          details: { reason: 'not_a_member' },
        });
      }
      if (error.code === 'P0002') {
        throw new ApiError('not_found', 'Story not found.');
      }
      if (error.code === '45010') {
        throw new ApiError('conflict', 'Add at least one acceptance criterion before marking the story ready to test.', {
          details: { reason: 'ac_required_for_ready_to_test' },
        });
      }
      throw new ApiError('internal_error', error.message);
    }
    resultRow = data;
  }

  // Nothing actually changed (e.g. resubmitting an identical, locked Jira key) ->
  // return the current row so the 0-row result is not mistaken for a denial.
  if (resultRow === null) {
    const { data: current, error: currentError } = await db
      .from('user_stories')
      .select(STORY_COLUMNS)
      .eq('id', storyId)
      .is('archived_at', null)
      .maybeSingle();
    if (currentError) {
      throw new ApiError('internal_error', currentError.message);
    }
    resultRow = current;
  }

  return jsonResponse({ user_story: resultRow }, { status: 200 });
}, { auth: 'required' });

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const storyId = extractStoryId(request);
  if (!isUuid(storyId)) {
    throw new ApiError('bad_request', 'Story id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const { data: existing, error: readError } = await db
    .from('user_stories')
    .select('id, archived_at')
    .eq('id', storyId)
    .maybeSingle();
  if (readError) {
    throw new ApiError('internal_error', readError.message);
  }
  if (!existing) {
    throw new ApiError('not_found', 'Story not found.');
  }
  if (existing.archived_at !== null) {
    throw new ApiError('conflict', 'Story is already archived.', {
      details: { reason: 'already_archived' },
    });
  }

  const { data, error } = await db
    .from('user_stories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', storyId)
    .is('archived_at', null)
    .select(STORY_COLUMNS)
    .maybeSingle();
  if (error) {
    mapStoryWriteError(error);
  }
  if (!data) {
    throw new ApiError('forbidden', 'You must be a member of this project.', {
      details: { reason: 'not_a_member' },
    });
  }

  return jsonResponse({ user_story: data }, { status: 200 });
}, { auth: 'required' });

function extractStoryId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
