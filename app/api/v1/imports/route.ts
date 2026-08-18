import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { runImportJob } from '@lib/jira/import-runner';
import { after } from 'next/server';
import { z } from 'zod';

// POST /api/v1/imports — enqueue an async Jira import for a project. Returns 202
// with the job id; a background worker (Vercel `after()`) pages through Jira and
// upserts stories + criteria. Member-only (the import_jobs INSERT policy gates to
// member+). At most one active import per project (serialized -> 409).
//
// GET the job at /api/v1/imports/{id} to poll status + counts + errors.

const CreateBodySchema = z.object({
  project_id: z.string().uuid(),
  jql: z.string().trim().min(1).max(2000),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { project_id, jql } = CreateBodySchema.parse(payload);

  // Existence + workspace resolution. RLS scopes the read to projects the caller
  // can see, so an outsider reads as not found.
  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id, workspace_id')
    .eq('id', project_id)
    .maybeSingle();
  if (projectError) {
    throw new ApiError('internal_error', projectError.message);
  }
  if (!project) {
    throw new ApiError('not_found', 'Project not found.');
  }

  // Serialize: at most one active (queued/running) import per project. A partial
  // unique index (0020) is the race-proof guard; this is the fast-path 409.
  const { data: active, error: activeError } = await db
    .from('import_jobs')
    .select('id')
    .eq('project_id', project_id)
    .in('status', ['queued', 'running'])
    .limit(1)
    .maybeSingle();
  if (activeError) {
    throw new ApiError('internal_error', activeError.message);
  }
  if (active) {
    throw new ApiError('conflict', 'An import is already running for this project.', {
      details: { reason: 'import_in_progress' },
    });
  }

  // RLS INSERT policy gates to member+; a viewer's insert is rejected (42501).
  const { data, error } = await db
    .from('import_jobs')
    .insert({ workspace_id: project.workspace_id, project_id, jql })
    .select('id, status')
    .single();
  if (error) {
    if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
      throw new ApiError('forbidden', 'You must be a member of this project to import.', {
        details: { reason: 'not_a_member' },
      });
    }
    // The one-active-per-project unique index (0020) — lost the enqueue race.
    if (error.code === '23505') {
      throw new ApiError('conflict', 'An import is already running for this project.', {
        details: { reason: 'import_in_progress' },
      });
    }
    throw new ApiError('internal_error', error.message);
  }

  // Process in the background after the 202 is flushed (Vercel Fluid Compute).
  after(async () => runImportJob(data.id));

  return jsonResponse({ import_job_id: data.id, status: data.status }, { status: 202 });
}, {
  auth: 'authenticated',
  why: 'BK-498 pending — authoring domain (project sub-resources).',
});
