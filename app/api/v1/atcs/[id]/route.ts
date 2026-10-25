import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { parseAtcExpand } from '@lib/atcs/expand';
import { readVersionPrecondition } from '@lib/atcs/optimistic-lock';
import { sanitizeAtcAssertions, sanitizeAtcSteps } from '@lib/atcs/sanitize';
import { AtcUpdateBodySchema, stepPositionsError } from '@lib/atcs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { atcUsage, getAtc, updateAtc } from '@lib/supabase/rpc';

// PATCH /api/v1/atcs/{id} — edit an ATC (BK-18 + BK-21). PUT-style full replace:
// omitted children are cleared, not merged. An empty body is a 200 no-op (no
// version bump, no event). Optimistic locking via `X-If-Match: <version>` (409
// on mismatch); the reserved `If-Match` header cannot be used on Vercel (the
// edge rewrites it to 412 — BK-96) but is read as an off-Vercel fallback.
// user_story_id / module_id / slug are immutable. Auth: Bearer `atc:write`
// (or cookie).
//
// BK-21 — ATC edit propagation. Tests reference an ATC through test_steps.atc_id
// and never copy its content, so an edit is visible to every chaining Test on
// its next read with no extra work. The response reports `affected_test_count`
// = the DISTINCT Tests that chain the ATC (one Test chaining it multiple times
// counts once), derived from the bunkai_atc_usage RPC; the emitted `atc.updated`
// event carries the authoritative in-transaction `affected_test_ids`.

interface AtcReturn {
  version: number
}

// GET /api/v1/atcs/{id} — read one ATC (BK-595). Routes through the same
// membership-gated bunkai_get_atc RPC the PATCH no-op uses (no second payload
// definition). Lean by default: header only; `expand=steps,assertions,
// acceptance_criteria,used_in` opts into detail. Absence, archived and
// inaccessible all answer one uniform 404 (the RPC's 42501 is folded into it so a
// stranger cannot enumerate ids). Reads never write. Private, never cached.
// Auth: Bearer `atc:read` (or cookie).
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const atcId = extractAtcId(request);
  if (!isUuid(atcId)) {
    throw new ApiError('bad_request', 'ATC id must be a UUID.');
  }
  const parsed = parseAtcExpand(new URL(request.url).searchParams.getAll('expand'));
  if (!parsed.ok) {
    throw new ApiError('bad_request', `Unrecognised expand value '${parsed.invalid}'. Allowed: steps, assertions, acceptance_criteria, used_in.`, {
      details: { reason: 'expand_invalid', value: parsed.invalid },
    });
  }
  const { expansions } = parsed;

  const { principal } = getAuth(ctx);
  const supabase = createAdminClient();

  const { data, error } = await getAtc(supabase, { actorUserId: principal.userId, atcId });
  if (error) {
    if (error.code === '42501' || error.code === 'P0002') {
      throw new ApiError('not_found', 'ATC not found.', { details: { reason: 'not_found' } });
    }
    mapAtcRpcError(error);
  }

  const { steps, assertions, acceptance_criterion_ids: acIds, ...header } = data as unknown as {
    steps: unknown[]
    assertions: unknown[]
    acceptance_criterion_ids: string[]
    [key: string]: unknown
  };
  const atc: Record<string, unknown> = { ...header };
  if (expansions.has('steps')) {
    atc.steps = steps;
  }
  if (expansions.has('assertions')) {
    atc.assertions = assertions;
  }
  if (expansions.has('acceptance_criteria')) {
    let criteria: unknown[] = [];
    if (acIds.length > 0) {
      const { data: rows, error: acError } = await supabase
        .from('acceptance_criteria')
        .select('id, user_story_id, title, description, position, archived_at')
        .in('id', acIds)
        .order('position', { ascending: true });
      if (acError) {
        throw new ApiError('internal_error', acError.message);
      }
      criteria = rows ?? [];
    }
    atc.acceptance_criteria = criteria;
  }
  if (expansions.has('used_in')) {
    const { data: usage, error: usageError } = await atcUsage(supabase, { actorUserId: principal.userId, atcId });
    if (usageError) {
      mapAtcRpcError(usageError);
    }
    atc.used_in = (usage as unknown as { used_in: unknown[] } | null)?.used_in ?? [];
  }

  return jsonResponse({ atc }, { status: 200, headers: PRIVATE_HEADERS });
}, { auth: 'required', requires: ['atc:read'] });

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const atcId = extractAtcId(request);
  if (!isUuid(atcId)) {
    throw new ApiError('bad_request', 'ATC id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const raw = (await request.text()).trim();
  const supabase = createAdminClient();

  // Empty body = no-op: return the current ATC (membership-gated), no bump, no
  // event. A no-op propagates nothing, so affected_test_count is 0.
  if (raw === '' || raw === '{}') {
    const { data, error } = await getAtc(supabase, { actorUserId: principal.userId, atcId });
    if (error) {
      mapAtcRpcError(error);
    }
    return jsonResponse(
      { atc: data, version: (data as unknown as AtcReturn).version, affected_test_count: 0 },
      { status: 200 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  if (parsed !== null && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
    const { data, error } = await getAtc(supabase, { actorUserId: principal.userId, atcId });
    if (error) {
      mapAtcRpcError(error);
    }
    return jsonResponse(
      { atc: data, version: (data as unknown as AtcReturn).version, affected_test_count: 0 },
      { status: 200 },
    );
  }

  const body = AtcUpdateBodySchema.parse(parsed);

  const positionError = stepPositionsError(body.steps);
  if (positionError) {
    throw new ApiError('steps_position_invalid', 'Step positions must be integers, strictly increasing from 1.', {
      details: positionError,
    });
  }

  // Optimistic lock. The version token rides `X-If-Match` (custom header) so the
  // Vercel edge does not intercept it as an RFC 7232 precondition (BK-96).
  const precondition = readVersionPrecondition(request.headers);
  if (!precondition.ok) {
    throw new ApiError('bad_request', 'X-If-Match must be a decimal integer version.');
  }
  const ifMatch = precondition.version;

  const { data, error } = await updateAtc(supabase, {
    actorUserId: principal.userId,
    atcId,
    ifMatch,
    title: body.title.trim(),
    layer: body.layer,
    // BK-399 — optional classification, full-replace like `tags`: an explicit
    // null AND an omitted key both clear the stored value (the schema defaults
    // to null), matching this endpoint's documented PUT-style semantics above.
    technique: body.technique,
    priority: body.priority,
    tags: body.tags,
    steps: sanitizeAtcSteps(body.steps),
    assertions: sanitizeAtcAssertions(body.assertions),
    acIds: body.acceptance_criterion_ids,
  });
  if (error) {
    mapAtcRpcError(error);
  }

  // BK-21 — affected Test count for the save confirmation. Editing an ATC does
  // not touch test_steps, so this post-commit read reflects the same chaining
  // Tests whose event ids were captured in-transaction. Reuses the membership-
  // gated bunkai_atc_usage RPC (0029); `count` is DISTINCT Tests (a Test that
  // chains the ATC multiple times counts once).
  const { data: usage, error: usageError } = await atcUsage(supabase, {
    actorUserId: principal.userId,
    atcId,
  });
  if (usageError) {
    mapAtcRpcError(usageError);
  }
  const affectedTestCount = usage ? (usage as unknown as { count: number }).count : 0;

  return jsonResponse(
    {
      atc: data,
      version: (data as unknown as AtcReturn).version,
      affected_test_count: affectedTestCount,
    },
    { status: 200 },
  );
}, { auth: 'required', requires: ['atc:write'] });

function extractAtcId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
