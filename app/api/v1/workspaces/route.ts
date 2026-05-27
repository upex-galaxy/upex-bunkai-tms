import type { NextRequest } from 'next/server';
import { requireAuth } from '@lib/api/auth';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/workspaces — create a workspace and auto-enrol the caller as
// `owner`. Wraps the SECURITY DEFINER RPC `bunkai_bootstrap_workspace` so the
// REST layer reuses the same transactional guarantee the onboarding form has
// historically used. The REST layer adds Zod validation + reserved-slug
// rejection + a deterministic 409 on slug collisions.
//
// GET /api/v1/workspaces — list workspaces the caller is an active member of.
// RLS already filters; we just project the columns the client needs.

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// Routes the Next.js app owns. A workspace slug must not shadow them or the
// `/{slug}` style paths we are likely to introduce post-MVP collide silently.
const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'docs',
  'invites',
  'login',
  'logout',
  'onboarding',
  'projects',
  'public',
  'qa',
  'settings',
  'static',
  'workspaces',
  '_next',
]);

const CreateBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .min(3)
    .max(40)
    .refine(value => SLUG_REGEX.test(value), {
      message: 'Slug must be lowercase letters/digits/hyphens, 3–40 chars, no edge hyphen.',
    })
    .refine(value => !RESERVED_SLUGS.has(value), {
      message: 'Slug is reserved.',
    }),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in to create a workspace.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { name, slug } = CreateBodySchema.parse(payload);

  const { data: workspaceId, error } = await supabase.rpc(
    'bunkai_bootstrap_workspace',
    { p_slug: slug, p_name: name },
  );

  if (error) {
    // SQLSTATE 23505 = unique_violation on workspaces.slug.
    if (error.code === '23505') {
      throw new ApiError('conflict', `Slug "${slug}" is already taken.`);
    }
    if (error.code === '22023') {
      throw new ApiError('validation_failed', error.message);
    }
    if (error.code === '42501') {
      throw new ApiError('unauthorized', 'Authentication required.');
    }
    throw new ApiError('internal_error', error.message);
  }

  const { data: workspace, error: fetchError } = await supabase
    .from('workspaces')
    .select('id, slug, name, owner_user_id, plan, created_at')
    .eq('id', workspaceId)
    .single();

  if (fetchError || !workspace) {
    throw new ApiError('internal_error', fetchError?.message ?? 'Workspace fetch failed.');
  }

  return jsonResponse({ workspace }, { status: 201 });
});

export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request);

  if (auth.source === 'cookie') {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, slug, name, owner_user_id, plan, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      throw new ApiError('internal_error', error.message);
    }
    return jsonResponse({ workspaces: data ?? [] });
  }

  // Bearer path — admin client bypasses RLS; we join on workspace_members
  // ourselves so the caller only sees workspaces they actually belong to.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workspace_members')
    .select('workspace_id, status, workspaces!inner(id, slug, name, owner_user_id, plan, created_at)')
    .eq('user_id', auth.userId)
    .eq('status', 'active');
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  const workspaces = (data ?? [])
    .map(r => r.workspaces as unknown as {
      id: string
      slug: string
      name: string
      owner_user_id: string
      plan: string
      created_at: string
    })
    .filter(Boolean)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return jsonResponse({ workspaces });
});
