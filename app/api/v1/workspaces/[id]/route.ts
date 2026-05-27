import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

const ParamsSchema = z.object({ id: z.string().uuid() });

const PatchBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>
}

export const GET = withApiHandler(async (request: NextRequest, _ctx) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }
  const id = extractId(request);
  const parsed = ParamsSchema.safeParse({ id });
  if (!parsed.success) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, slug, name, owner_user_id, plan, created_at')
    .eq('id', parsed.data.id)
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Workspace not found.');
  }

  return jsonResponse({ workspace: data });
});

export const PATCH = withApiHandler(async (request: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }
  const id = extractId(request);
  const parsed = ParamsSchema.safeParse({ id });
  if (!parsed.success) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const patch = PatchBodySchema.parse(payload);

  if (!patch.name) {
    throw new ApiError('bad_request', 'Provide at least one field to update.');
  }

  // RLS gates the update to workspace owners; non-owners get zero rows back.
  const { data, error } = await supabase
    .from('workspaces')
    .update({ name: patch.name })
    .eq('id', parsed.data.id)
    .select('id, slug, name, owner_user_id, plan, created_at')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('forbidden', 'You do not have permission to update this workspace.');
  }

  return jsonResponse({ workspace: data });
});

function extractId(request: NextRequest): string {
  // App Router exposes route params via context, but withApiHandler is generic
  // so we read it from the URL path directly. `/api/v1/workspaces/{id}` →
  // segment after the literal "workspaces".
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

export type { RouteContext };
