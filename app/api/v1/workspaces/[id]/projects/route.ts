import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { hasAlphanumeric, slugify } from '@lib/utils/slug';
import { z } from 'zod';

// POST /api/v1/workspaces/{id}/projects — a workspace member (role >= member)
// creates a project. The slug is auto-derived from the name and is unique per
// workspace; a collision returns 409. RLS gates the insert to members, so a
// non-member's insert is rejected by Postgrest (42501) and mapped to 403.
//
// HYBRID error model: every body-rule failure keeps the house `code`
// (`validation_failed`) but carries a granular `details.reason` so QA can tell
// the individual rules apart.

const MAX_DESCRIPTION_BYTES = 5120;

const CreateBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { name, description } = CreateBodySchema.parse(payload);

  const trimmedName = name.trim();
  if (trimmedName.length < 3) {
    throw new ApiError('validation_failed', 'Name must be at least 3 characters.', {
      details: { reason: 'name_too_short' },
    });
  }
  if (trimmedName.length > 80) {
    throw new ApiError('validation_failed', 'Name must be at most 80 characters.', {
      details: { reason: 'name_too_long' },
    });
  }
  if (!hasAlphanumeric(trimmedName)) {
    throw new ApiError('validation_failed', 'Name must contain at least one alphanumeric character.', {
      details: { reason: 'name_no_alphanumeric' },
    });
  }
  if (description !== undefined && Buffer.byteLength(description, 'utf8') > MAX_DESCRIPTION_BYTES) {
    throw new ApiError('validation_failed', 'Description must be at most 5KB.', {
      details: { reason: 'description_too_large' },
    });
  }

  const slug = slugify(name);
  if (slug.length < 3) {
    throw new ApiError('validation_failed', 'Name must yield a slug of at least 3 characters.', {
      details: { reason: 'name_no_alphanumeric' },
    });
  }

  // RLS gates the insert to members with role >= member; non-members receive a
  // permission error from Postgrest that we map to 403.
  const { data, error } = await db
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      slug,
      name: trimmedName,
      description: description ?? null,
    })
    .select('id, slug, name, description, workspace_id, created_at')
    .single();

  if (error) {
    // SQLSTATE 23505 = unique_violation on projects(workspace_id, slug).
    if (error.code === '23505') {
      throw new ApiError('conflict', 'A project with this slug already exists in the workspace.', {
        details: { reason: 'slug_duplicate_in_workspace' },
      });
    }
    if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
      throw new ApiError('forbidden', 'You must be a member of this workspace to create a project.', {
        details: { reason: 'not_a_member' },
      });
    }
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ project: data }, { status: 201 });
}, { auth: 'required' });

function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
