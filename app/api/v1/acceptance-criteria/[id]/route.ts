import type { NextRequest } from 'next/server';
import { criterionTitleMessage, mapCriterionRpcError, mapCriterionWriteError } from '@lib/acceptance-criteria/errors';
import { criterionTitleError, MAX_CRITERION_DESCRIPTION_BYTES } from '@lib/acceptance-criteria/validation';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { byteLength } from '@lib/markdown/format';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { z } from 'zod';

// GET    /api/v1/acceptance-criteria/{id} — read one active criterion.
// PATCH  /api/v1/acceptance-criteria/{id} — edit title/detail (direct RLS update)
//   and/or move it to a new position (atomic re-number via the SECURITY DEFINER
//   function bunkai_move_acceptance_criterion).
// DELETE /api/v1/acceptance-criteria/{id} — soft-archive, close the position gap,
//   and drop the parent story out of ready_to_test when it was the last one
//   (bunkai_archive_acceptance_criterion).
//
// Authorization rides the acceptance_criteria RLS policies; the Markdown detail
// is sanitized on save (BK-16). 403-vs-404: an outsider reads as 404 (RLS hides);
// an in-workspace viewer reads ok but a write touches 0 rows / hits the gate -> 403.

const AC_COLUMNS = 'id, user_story_id, title, description, position, created_at, archived_at';

const UpdateBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  position: z.number().int().positive().optional(),
});

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const id = extractId(request);
  if (!isUuid(id)) {
    throw new ApiError('bad_request', 'Acceptance criterion id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const { data, error } = await db
    .from('acceptance_criteria')
    .select(AC_COLUMNS)
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Acceptance criterion not found.');
  }

  return jsonResponse({ acceptance_criterion: data }, { status: 200 });
}, { auth: 'required' });

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const id = extractId(request);
  if (!isUuid(id)) {
    throw new ApiError('bad_request', 'Acceptance criterion id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = UpdateBodySchema.parse(payload);
  const hasTitle = body.title !== undefined;
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasPosition = body.position !== undefined;
  if (!hasTitle && !hasDescription && !hasPosition) {
    throw new ApiError('validation_failed', 'Provide a title, detail, or position.', {
      details: { reason: 'no_fields' },
    });
  }

  // Existence (404) before any write — RLS scopes the read, so an outsider is 404.
  const { data: existing, error: readError } = await db
    .from('acceptance_criteria')
    .select('id')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();
  if (readError) {
    throw new ApiError('internal_error', readError.message);
  }
  if (!existing) {
    throw new ApiError('not_found', 'Acceptance criterion not found.');
  }

  let result: unknown = null;

  // Title / detail edit — a direct, RLS-scoped update (no rebalance needed).
  if (hasTitle || hasDescription) {
    const update: { title?: string, description?: string | null } = {};

    if (hasTitle) {
      const titleReason = criterionTitleError(body.title ?? '');
      if (titleReason) {
        throw new ApiError('validation_failed', criterionTitleMessage(titleReason), {
          details: { reason: titleReason },
        });
      }
      update.title = (body.title ?? '').trim();
    }

    if (hasDescription) {
      const description = body.description ?? null;
      if (description !== null && byteLength(description) > MAX_CRITERION_DESCRIPTION_BYTES) {
        throw new ApiError('validation_failed', 'Detail must be at most 50 KB.', {
          details: { reason: 'description_too_long' },
        });
      }
      update.description = description !== null ? sanitizeMarkdown(description) : null;
    }

    const { data, error } = await db
      .from('acceptance_criteria')
      .update(update)
      .eq('id', id)
      .is('archived_at', null)
      .select(AC_COLUMNS)
      .maybeSingle();
    if (error) {
      mapCriterionWriteError(error);
    }
    if (!data) {
      // Row exists (read above) but the RLS-scoped update touched no rows -> viewer.
      throw new ApiError('forbidden', 'You must be a member of this project.', {
        details: { reason: 'not_a_member' },
      });
    }
    result = data;
  }

  // Reorder — atomic re-number via the SECURITY DEFINER move function.
  if (hasPosition) {
    const { data, error } = await db.rpc('bunkai_move_acceptance_criterion', {
      p_id: id,
      p_new_position: body.position as number,
    });
    if (error) {
      mapCriterionRpcError(error);
    }
    result = data;
  }

  return jsonResponse({ acceptance_criterion: result }, { status: 200 });
}, { auth: 'required' });

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const id = extractId(request);
  if (!isUuid(id)) {
    throw new ApiError('bad_request', 'Acceptance criterion id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  // Split 404 (not found) from 409 (already archived). RLS scopes the read.
  const { data: existing, error: readError } = await db
    .from('acceptance_criteria')
    .select('id, archived_at')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    throw new ApiError('internal_error', readError.message);
  }
  if (!existing) {
    throw new ApiError('not_found', 'Acceptance criterion not found.');
  }
  if (existing.archived_at !== null) {
    throw new ApiError('conflict', 'Acceptance criterion is already archived.', {
      details: { reason: 'already_archived' },
    });
  }

  const { data, error } = await db.rpc('bunkai_archive_acceptance_criterion', {
    p_id: id,
  });
  if (error) {
    mapCriterionRpcError(error);
  }

  const archived = data as { criterion: unknown, user_story_reverted: boolean } | null;
  return jsonResponse(
    {
      acceptance_criterion: archived?.criterion ?? null,
      user_story_reverted: archived?.user_story_reverted ?? false,
    },
    { status: 200 },
  );
}, { auth: 'required' });

function extractId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
