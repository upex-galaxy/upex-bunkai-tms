import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { moduleNameError } from '@lib/modules/path';
import { slugify } from '@lib/utils/slug';
import { z } from 'zod';

// PATCH  /api/v1/modules/{id} — rename a module and/or edit its description.
// DELETE /api/v1/modules/{id} — soft-delete (archive) the module, its descendant
//                               modules, and the linked user_stories /
//                               acceptance_criteria / atcs.
//
// Both are member-only (role >= member). The atomic work — the materialized-path
// rebuild across descendants on rename, and the cascade archive — runs inside the
// SECURITY DEFINER plpgsql functions `bunkai_update_module` /
// `bunkai_archive_module_subtree`, invoked via supabase.rpc(). A function body is
// a single transaction, so a partial failure rolls back cleanly. RLS does not
// apply inside a DEFINER function, so the functions role-gate with
// `bunkai_can_write_workspace` and raise 42501 for a viewer — which we map to 403.
//
// HYBRID error model (mirrors the create route): a body-rule failure keeps the
// house `code` (`validation_failed`) but carries a granular `details.reason`.

const MAX_DESCRIPTION_LENGTH = 500;

const UpdateBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  // BK-11 move: a UUID re-parents under that module; null moves to the project
  // root; the key absent means "no move". Processed by bunkai_move_module.
  parent_module_id: z.string().uuid().nullable().optional(),
});

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const moduleId = extractModuleId(request);
  if (!isUuid(moduleId)) {
    throw new ApiError('bad_request', 'Module id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = UpdateBodySchema.parse(payload);

  // `description: null` is a meaningful "clear it" instruction, so presence —
  // not truthiness — decides whether description is touched.
  const hasName = body.name !== undefined;
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasParent = Object.prototype.hasOwnProperty.call(body, 'parent_module_id');
  if (!hasName && !hasDescription && !hasParent) {
    throw new ApiError('validation_failed', 'Provide a new name, description, or parent.', {
      details: { reason: 'no_fields' },
    });
  }

  let trimmedName: string | null = null;
  let slug: string | null = null;
  if (hasName) {
    const reason = moduleNameError(body.name ?? '');
    if (reason) {
      throw new ApiError('validation_failed', nameMessage(reason), { details: { reason } });
    }
    trimmedName = (body.name ?? '').trim();
    slug = slugify(trimmedName);
    if (slug.length < 1) {
      throw new ApiError('validation_failed', nameMessage('name_no_alphanumeric'), {
        details: { reason: 'name_no_alphanumeric' },
      });
    }
  }

  const description = hasDescription ? body.description ?? null : null;
  if (description !== null && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ApiError('validation_failed', 'Description must be at most 500 characters.', {
      details: { reason: 'description_too_long' },
    });
  }

  // Existence (404). RLS scopes the read to modules the caller can see; an
  // archived module is filtered out here so an archived id reads as 404.
  await assertActiveModule(db, moduleId);

  let result: unknown = null;

  // Rename / description edit. Omit the args we are not changing — the SQL
  // params default to NULL / false, so the function leaves name/path (or
  // description) untouched. Clearing the description is "touch it
  // (p_update_description) but send no value", which the NULL default applies.
  if (hasName || hasDescription) {
    const rpcArgs: {
      p_module_id: string
      p_update_description: boolean
      p_name?: string
      p_new_slug?: string
      p_description?: string
    } = { p_module_id: moduleId, p_update_description: hasDescription };
    if (trimmedName !== null && slug !== null) {
      rpcArgs.p_name = trimmedName;
      rpcArgs.p_new_slug = slug;
    }
    if (description !== null) {
      // Sanitize on save (BK-16) — strip dangerous raw HTML + unsafe link schemes
      // before persisting; the renderer re-sanitizes on display.
      rpcArgs.p_description = sanitizeMarkdown(description);
    }

    const { data, error } = await db.rpc('bunkai_update_module', rpcArgs);
    if (error) {
      mapRpcError(error);
    }
    result = data;
  }

  // Move (BK-11). A UUID re-parents under that module; omitting p_new_parent_id
  // (null) moves to the project root. The function is atomic and re-bases every
  // descendant path; cycles/depth/cross-project are rejected with reason codes.
  if (hasParent) {
    const newParentId = body.parent_module_id ?? null;
    const moveArgs: { p_module_id: string, p_new_parent_id?: string } = { p_module_id: moduleId };
    if (newParentId !== null) {
      moveArgs.p_new_parent_id = newParentId;
    }

    const { data, error } = await db.rpc('bunkai_move_module', moveArgs);
    if (error) {
      mapRpcError(error);
    }
    result = data;
  }

  return jsonResponse({ module: result }, { status: 200 });
}, { auth: 'required' });

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const moduleId = extractModuleId(request);
  if (!isUuid(moduleId)) {
    throw new ApiError('bad_request', 'Module id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  // Split 404 (not found) from 409 (already archived) before the cascade. RLS
  // scopes the read; a non-visible module reads as 404.
  const { data: existing, error: selError } = await db
    .from('modules')
    .select('id, archived_at')
    .eq('id', moduleId)
    .maybeSingle();
  if (selError) {
    throw new ApiError('internal_error', selError.message);
  }
  if (!existing) {
    throw new ApiError('not_found', 'Module not found.');
  }
  if (existing.archived_at !== null) {
    throw new ApiError('conflict', 'Module is already archived.', {
      details: { reason: 'already_archived' },
    });
  }

  const { data, error } = await db.rpc('bunkai_archive_module_subtree', {
    p_module_id: moduleId,
  });
  if (error) {
    mapRpcError(error);
  }

  return jsonResponse({ archived: data }, { status: 200 });
}, { auth: 'required' });

// Reads the module by id (RLS-scoped, active only) and throws 404 when absent.
async function assertActiveModule(
  db: ReturnType<typeof getAuth>['db'],
  moduleId: string,
): Promise<void> {
  const { data, error } = await db
    .from('modules')
    .select('id')
    .eq('id', moduleId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Module not found.');
  }
}

// Maps a Postgres/PostgREST error from an rpc() call to the house envelope. The
// SECURITY DEFINER functions raise 42501 for a viewer and P0002 for a missing
// module; a sibling/destination slug collision trips unique(project_id, path) →
// 23505; the move function raises 45001/45002/45003 (with the reason as the
// message) for cycle / depth / invalid-parent.
function mapRpcError(error: { code?: string, message: string }): never {
  if (error.code === '42501') {
    throw new ApiError('forbidden', 'You must be a member of this project to edit a module.', {
      details: { reason: 'not_a_member' },
    });
  }
  if (error.code === '23505') {
    throw new ApiError('conflict', 'A module with this name already exists under the same parent.', {
      details: { reason: 'module_slug_duplicate' },
    });
  }
  if (error.code === 'P0002') {
    throw new ApiError('not_found', 'Module not found.');
  }
  const moveReason = moveReasonFromError(error);
  if (moveReason) {
    throw new ApiError('validation_failed', moveMessage(moveReason), {
      details: { reason: moveReason },
    });
  }
  throw new ApiError('internal_error', error.message);
}

type MoveReason = 'move_cycle' | 'depth_exceeded' | 'parent_invalid';

// Resolve a move-validation reason from the rpc error — by SQLSTATE primarily,
// falling back to the message (the function RAISEs the reason as its message).
function moveReasonFromError(error: { code?: string, message: string }): MoveReason | null {
  if (error.code === '45001' || error.message.includes('move_cycle')) {
    return 'move_cycle';
  }
  if (error.code === '45002' || error.message.includes('depth_exceeded')) {
    return 'depth_exceeded';
  }
  if (error.code === '45003' || error.message.includes('parent_invalid')) {
    return 'parent_invalid';
  }
  return null;
}

function moveMessage(reason: MoveReason): string {
  switch (reason) {
    case 'move_cycle':
      return 'A module cannot be moved under itself or one of its own sub-modules.';
    case 'depth_exceeded':
      return 'The maximum nesting depth is 6 levels.';
    case 'parent_invalid':
      return 'The target parent is not a valid module in this project.';
  }
}

function nameMessage(reason: string): string {
  switch (reason) {
    case 'name_required':
      return 'Module name is required.';
    case 'name_too_short':
      return 'Module name must be at least 2 characters.';
    case 'name_too_long':
      return 'Module name cannot exceed 80 characters.';
    case 'name_no_alphanumeric':
      return 'Module name must contain at least one letter or digit.';
    default:
      return 'Module name is invalid.';
  }
}

function extractModuleId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
