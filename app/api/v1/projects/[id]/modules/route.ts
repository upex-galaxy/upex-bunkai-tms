import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { buildModulePath, computeDepth, MAX_MODULE_DEPTH, nextPosition } from '@lib/modules/path';
import { hasAlphanumeric, slugify } from '@lib/utils/slug';
import { z } from 'zod';

// POST /api/v1/projects/{id}/modules — a workspace member (role >= member)
// creates a module inside a project. Modules form a self-referential tree (max
// depth 6) keyed by a materialized slash-separated `path` (NO leading slash).
// The path segment is auto-derived from the name and is unique per parent; a
// collision returns 409. RLS gates the insert to members, so a non-member's
// insert is rejected by Postgrest (42501) and mapped to 403. The DB also has a
// depth CHECK and a sibling-path unique constraint as safety nets.
//
// HYBRID error model: every body-rule failure keeps the house `code`
// (`validation_failed`) but carries a granular `details.reason` so QA can tell
// the individual rules apart.

const MAX_NAME_LENGTH = 80;
const MIN_NAME_LENGTH = 2;
const MAX_DESCRIPTION_LENGTH = 500;
const DEEP_NESTING_WARNING_THRESHOLD = 5;
const DEEP_NESTING_WARNING = 'This module is nested deeply — consider keeping the tree shallow.';

const CreateBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parent_module_id: z.string().uuid().optional(),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { name, description, parent_module_id } = CreateBodySchema.parse(payload);

  const trimmedName = name.trim();
  if (trimmedName.length < MIN_NAME_LENGTH) {
    throw new ApiError('validation_failed', 'Name must be at least 2 characters.', {
      details: { reason: 'name_too_short' },
    });
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw new ApiError('validation_failed', 'Name must be at most 80 characters.', {
      details: { reason: 'name_too_long' },
    });
  }
  if (!hasAlphanumeric(trimmedName)) {
    throw new ApiError('validation_failed', 'Name must contain at least one alphanumeric character.', {
      details: { reason: 'name_no_alphanumeric' },
    });
  }
  if (description !== undefined && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ApiError('validation_failed', 'Description must be at most 500 characters.', {
      details: { reason: 'description_too_long' },
    });
  }

  // Resolve the parent (if any) to derive its path and the resulting depth.
  // RLS scopes the lookup to modules the caller can read; same-project parent
  // is NOT enforced by RLS, so we check `parent.project_id` in the app layer.
  let parentPath = '';
  if (parent_module_id !== undefined) {
    const { data: parent, error: parentError } = await db
      .from('modules')
      .select('id, path, project_id')
      .eq('id', parent_module_id)
      .maybeSingle();

    if (parentError) {
      throw new ApiError('internal_error', parentError.message);
    }
    if (!parent || parent.project_id !== projectId) {
      throw new ApiError('validation_failed', 'Parent module not found in this project.', {
        details: { reason: 'parent_invalid' },
      });
    }
    parentPath = parent.path;
  }

  const resultingDepth = computeDepth(parentPath) + 1;
  if (resultingDepth > MAX_MODULE_DEPTH) {
    throw new ApiError('validation_failed', 'Module nesting cannot exceed 6 levels.', {
      details: { reason: 'depth_exceeded' },
    });
  }
  const warning = resultingDepth >= DEEP_NESTING_WARNING_THRESHOLD;

  const segment = slugify(trimmedName);
  if (segment.length < 1) {
    throw new ApiError('validation_failed', 'Name must yield a non-empty slug.', {
      details: { reason: 'name_no_alphanumeric' },
    });
  }
  const path = buildModulePath(parentPath, segment);

  // Position = max sibling position + 1 within the (project_id, parent) set.
  // Best-effort; RLS scopes the read to siblings the caller can see.
  let siblingQuery = db
    .from('modules')
    .select('position')
    .eq('project_id', projectId);
  siblingQuery = parent_module_id !== undefined
    ? siblingQuery.eq('parent_module_id', parent_module_id)
    : siblingQuery.is('parent_module_id', null);

  const { data: siblings, error: siblingError } = await siblingQuery;
  if (siblingError) {
    throw new ApiError('internal_error', siblingError.message);
  }
  const position = nextPosition((siblings ?? []).map(s => s.position));

  // RLS gates the insert to members with role >= member; non-members receive a
  // permission error from Postgrest that we map to 403.
  const { data, error } = await db
    .from('modules')
    .insert({
      project_id: projectId,
      parent_module_id: parent_module_id ?? null,
      path,
      name: trimmedName,
      position,
      // Sanitize on save (BK-16 defense-in-depth): strip dangerous raw HTML and
      // unsafe link schemes from the stored Markdown. The renderer re-sanitizes.
      description: description !== undefined ? sanitizeMarkdown(description) : null,
    })
    .select('id, project_id, parent_module_id, path, name, position, description, created_at')
    .single();

  if (error) {
    // SQLSTATE 23505 = unique_violation on modules(project_id, path).
    if (error.code === '23505') {
      throw new ApiError('conflict', 'A module with this name already exists under the same parent.', {
        details: { reason: 'module_slug_duplicate' },
      });
    }
    // SQLSTATE 23514 = check_violation — the depth CHECK is the DB safety net.
    if (error.code === '23514') {
      throw new ApiError('validation_failed', 'Module nesting cannot exceed 6 levels.', {
        details: { reason: 'depth_exceeded' },
      });
    }
    if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
      throw new ApiError('forbidden', 'You must be a member of this project to create a module.', {
        details: { reason: 'not_a_member' },
      });
    }
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse(
    { module: data, ...(warning ? { warning: DEEP_NESTING_WARNING } : {}) },
    { status: 201 },
  );
}, { auth: 'required' });

function extractProjectId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('projects');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
