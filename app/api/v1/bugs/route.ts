import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapBugRpcError } from '@lib/bugs/errors';
import { decodeBugsCursor } from '@lib/bugs/list-cursor';
import { parseBugsListParams } from '@lib/bugs/list-query';
import { BugCreateBodySchema, isRunLinkedBugBody } from '@lib/bugs/validation';
import { mapRunRpcError } from '@lib/runs/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { createBug, getRunExpanded } from '@lib/supabase/rpc';
import { assertModuleInProject, emptyBugsListPage, fetchBugsListPage, resolveBugsProjectVisibility } from './list-response';

// POST /api/v1/bugs — file a TMS-native bug, either linked to a failed run
// step or standalone (BK-40). Auth: Bearer `atc:write` (or a cookie session) —
// reuses the existing capability rather than inventing a new `bug:*` scope
// (Technical Decision 13).
//
// Run-linked path: the body carries ONLY `run_step_id` — project_id/module_id/
// run_id/atc_id are NEVER accepted from the client here (Technical Decision 7).
// They are derived by (a) resolving the step's owning run_id (a plain
// provenance lookup — no data is disclosed by this step alone), then (b)
// reading that run through the SAME membership-gated RPC the runner already
// uses (`bunkai_get_run_expanded` / `getRunExpanded`), which is what actually
// proves "the caller can read this run". `locateRunStepBugContext` then finds
// the specific step inside that read to confirm it exists and is `'failed'`
// (the ATP-N1 backstop at the HTTP edge) and to read off project_id/module_id/
// atc_id from the SAME trusted payload. `bunkai_create_bug` still independently
// re-validates module ∈ project (defense in depth) regardless of this path.
//
// Standalone path: project_id + module_id come straight from the body;
// `bunkai_create_bug`'s own module ∈ project check is the actual enforcement
// point either way.

export interface RunJsonForBugContext {
  id: string
  project_id: string
  module_id: string | null
  atcs: { atc_id: string | null, steps: { id: string, status: string }[] }[]
}

export interface BugRunContext {
  runId: string
  projectId: string
  moduleId: string | null
  atcId: string | null
  stepStatus: string
}

// Pure/synchronous — locates one run_step within an already-fetched,
// membership-gated `bunkai_run_json` payload. Directly unit-testable with a
// plain object, no DB round trip (mirrors `resolveRunWorkspaceId`'s
// DB-parametrized-function isolation style in app/api/v1/runs/route.ts).
export function locateRunStepBugContext(
  run: RunJsonForBugContext,
  runStepId: string,
): BugRunContext | null {
  for (const atc of run.atcs) {
    const step = atc.steps.find(s => s.id === runStepId);
    if (step) {
      return {
        runId: run.id,
        projectId: run.project_id,
        moduleId: run.module_id,
        atcId: atc.atc_id,
        stepStatus: step.status,
      };
    }
  }
  return null;
}

// Pure — the ATP-N1 backstop itself (not just the status report
// `locateRunStepBugContext` above returns). Extracted so a test can exercise
// the actual enforcement decision directly, rather than only proving the
// step's status was read correctly (final-assembly review finding,
// 2026-08-01 — the prior test coverage proved the LATTER, never the former).
export function assertRunLinkedStepIsFailed(stepStatus: string): void {
  if (stepStatus !== 'failed') {
    throw new ApiError('validation_failed', 'Bug filing is only available for a failed run step.', {
      details: { reason: 'run_step_not_failed' },
    });
  }
}

interface RunStepRow { run_atc_id: string }
interface RunAtcRow { run_id: string }

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = BugCreateBodySchema.parse(payload);

  const supabase = createAdminClient();

  let projectId: string;
  let moduleId: string;
  let runId: string | null = null;
  let runStepId: string | null = null;
  let atcId: string | null = null;

  if (isRunLinkedBugBody(body)) {
    // Step -> run_atc -> run_id. A plain provenance lookup: no row DATA is
    // returned to the caller from this step, only an id used to feed the
    // authorization-checking read right after.
    const { data: stepRow, error: stepError } = await supabase
      .from('run_steps')
      .select('run_atc_id')
      .eq('id', body.run_step_id)
      .maybeSingle<RunStepRow>();
    if (stepError) {
      throw new ApiError('internal_error', stepError.message);
    }
    if (!stepRow) {
      throw new ApiError('not_found', 'Run step not found.', { details: { reason: 'not_found' } });
    }

    const { data: atcRow, error: atcError } = await supabase
      .from('run_atcs')
      .select('run_id')
      .eq('id', stepRow.run_atc_id)
      .maybeSingle<RunAtcRow>();
    if (atcError) {
      throw new ApiError('internal_error', atcError.message);
    }
    if (!atcRow) {
      throw new ApiError('not_found', 'Run step not found.', { details: { reason: 'not_found' } });
    }

    // The membership-gated read: proves the actor can read this run (or maps
    // to the same not_found/forbidden non-disclosure the runner itself gets).
    const { data: runData, error: runError } = await getRunExpanded(supabase, {
      actorUserId: principal.userId,
      runId: atcRow.run_id,
    });
    if (runError) {
      mapRunRpcError(runError);
    }

    const context = locateRunStepBugContext(runData as unknown as RunJsonForBugContext, body.run_step_id);
    if (!context) {
      throw new ApiError('not_found', 'Run step not found.', { details: { reason: 'not_found' } });
    }
    // ATP-N1 backstop at the HTTP edge: "Report defect" is not available for
    // a step that isn't failed — a direct API caller gets the same rule.
    assertRunLinkedStepIsFailed(context.stepStatus);

    // The failing step's OWN ATC module — NOT context.moduleId (the run's
    // chain-position-1 snapshot), which is wrong whenever the Test's chain
    // spans more than one module (0040_run_module_snapshot.sql's own header:
    // "a chain can span more than one module" — an acknowledged, normal
    // scenario, not an edge case). Falls back to the run-level snapshot only
    // when the ATC's own row was itself deleted after the run started
    // (atcId is provenance-only, ON DELETE SET NULL) — the same rare case
    // the null-module check below already covers.
    let atcModuleId: string | null = null;
    if (context.atcId) {
      const { data: atcRow, error: atcModuleError } = await supabase
        .from('atcs')
        .select('module_id')
        .eq('id', context.atcId)
        .maybeSingle<{ module_id: string }>();
      if (atcModuleError) {
        throw new ApiError('internal_error', atcModuleError.message);
      }
      atcModuleId = atcRow?.module_id ?? null;
    }
    const resolvedModuleId = atcModuleId ?? context.moduleId;
    if (resolvedModuleId === null) {
      // Extremely rare: neither the ATC's own module nor the run's snapshot
      // resolved (e.g. both the ATC and the chain-position-1 ATC were
      // deleted after the run started — see 0040_run_module_snapshot.sql's
      // own Risk R-3 note). There is no module left to file the bug against.
      throw new ApiError('validation_failed', 'This run has no module to file a bug against.', {
        details: { reason: 'run_module_missing' },
      });
    }

    projectId = context.projectId;
    moduleId = resolvedModuleId;
    runId = context.runId;
    runStepId = body.run_step_id;
    atcId = context.atcId;
  }
  else {
    projectId = body.project_id;
    moduleId = body.module_id;
  }

  const { data, error } = await createBug(supabase, {
    actorUserId: principal.userId,
    projectId,
    moduleId,
    title: body.title,
    severity: body.severity,
    description: body.description ?? null,
    stepsToReproduce: body.steps_to_reproduce ?? '',
    evidenceUrls: body.evidence_urls ?? [],
    runId,
    runStepId,
    atcId,
  });
  if (error) {
    mapBugRpcError(error);
  }

  return jsonResponse({ bug: data }, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });

// GET /api/v1/bugs — filtered, paginated, aggregate-bearing defect list
// (BK-41 Slice 2). Auth: `auth: 'required'`, no PAT scope requirement
// (Decision 2 — mirrors GET /api/v1/activity and GET /api/v1/tests/{id}/runs,
// neither of which gates on a scope; the AC's original "PAT scope bugs:read"
// wording described a scope that was never implemented). Pagination is the
// bugs-local 3-field keyset cursor (`lib/bugs/list-cursor.ts`, Decision 11);
// a malformed `cursor` is a 400, never a silent first page (Decision 4). A
// caller who cannot see `project_id` collapses into the SAME 200
// `{data: [], aggregates: zeroed}` a genuinely-empty, visible project would
// return — never a 403 (Decision 9; see `list-response.ts`'s own comment on
// why this departs from the ATP outline's original ATP-9 wording).
//
// Uses the CALLER'S OWN RLS-scoped client (`getAuth(ctx).db`), NEVER
// `createAdminClient()` — `bunkai_list_bugs` is SECURITY INVOKER (migration
// 0051_bugs_list.sql): it runs its SELECT under the calling role, so RLS's
// `bugs_select_workspace_member` evaluates against THIS request's own
// auth.uid(). An admin/service-role client has no authenticated auth.uid() —
// using one here would bypass that RLS check entirely (see
// `lib/supabase/rpc.ts`'s `listBugs` comment).

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { db } = getAuth(ctx);

  const query = parseBugsListParams(request.nextUrl.searchParams);

  // An undecodable cursor is a client bug, not "start over": silently
  // answering with the first page would re-serve rows the caller already has
  // (mirrors GET /api/v1/activity's own decodeActivityCursor gate).
  let cursorSeverity: string | null = null;
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (query.cursor !== undefined) {
    const decoded = decodeBugsCursor(query.cursor);
    if (!decoded.ok) {
      throw new ApiError('bad_request', 'The cursor is not a valid page token.');
    }
    cursorSeverity = decoded.cursor.severity;
    cursorCreatedAt = decoded.cursor.createdAt;
    cursorId = decoded.cursor.id;
  }

  // Decision 9: a foreign/nonexistent project_id never reaches the RPC — it
  // collapses into the same 200 empty page a genuinely-empty project would
  // return, checked against the CALLER'S OWN RLS-scoped client.
  const projectVisible = await resolveBugsProjectVisibility(db, query.project_id);
  if (!projectVisible) {
    return jsonResponse(emptyBugsListPage(), { status: 200 });
  }

  // Decision 10: only disclose module_not_in_project AFTER project_id is
  // confirmed visible — the caller has already proven project membership.
  if (query.module_id) {
    await assertModuleInProject(db, { projectId: query.project_id, moduleId: query.module_id });
  }

  const page = await fetchBugsListPage(db, {
    projectId: query.project_id,
    moduleId: query.module_id ?? null,
    statuses: query.status ?? null,
    severities: query.severity ?? null,
    limit: query.limit,
    cursorSeverity,
    cursorCreatedAt,
    cursorId,
  });

  return jsonResponse(page, { status: 200 });
}, { auth: 'required' });
