import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { isReservedProjectSlug } from '@lib/projects/validation';
import { hasAlphanumeric, slugifyWithFallback } from '@lib/utils/slug';
import { z } from 'zod';
import { assertCanCreateProject, mapCreateProjectError } from './response';

// POST /api/v1/workspaces/{id}/projects — a workspace member (role >= member)
// creates a project. The slug is auto-derived from the name and is unique per
// workspace; a collision returns 409. A caller without write access to the
// workspace (non-member, viewer, or a workspace that does not exist) gets
// 403 not_a_member from `assertCanCreateProject` before the insert (BK-992).
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

  // Derive the slug with a deterministic hash fallback (BK-53): names that
  // transliterate to fewer than 3 slug chars (CJK, Cyrillic — and, deliberately,
  // short ASCII leftovers like 'ab!') now get `project-<hash>` instead of a 422.
  const slug = slugifyWithFallback(trimmedName, 'project', 3);
  // Reserved words shadow app routes / future URL surface, so they are checked
  // on the FINAL slug — after the fallback — per BK-8 AC-11 (BK-51).
  if (isReservedProjectSlug(slug)) {
    throw new ApiError('validation_failed', 'This name maps to a reserved URL slug.', {
      details: { reason: 'slug_reserved' },
    });
  }

  // BK-992: gate on write access BEFORE the insert. The project-limit trigger
  // (0077) fires before the RLS WITH CHECK, so without this a non-existent or
  // foreign workspace surfaced as 422 project_limit_reached instead of 403.
  await assertCanCreateProject(db, workspaceId);

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
    mapCreateProjectError(error);
  }

  return jsonResponse({ project: data }, { status: 201 });
// Routine content creation inside an ALREADY-EXISTING workspace, so it reuses
// `atc:write` rather than minting a new scope. The gateway evaluates the
// capability before this body runs, so a PAT without `atc:write` never reaches
// the RLS-gated insert above; a PAT that holds it but whose caller is not a
// member is rejected by `assertCanCreateProject` with 403.
}, { auth: 'required', requires: ['atc:write'] });

function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
