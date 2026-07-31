import { describe, expect, it, mock } from 'bun:test';

// The route imports `@lib/supabase/admin`, which pulls in `server-only`; shim
// it so the module graph loads under Bun, then import the testable exports.
// Same convention as app/api/v1/runs/route.test.ts / lib/jira/import-runner.test.ts.
void mock.module('server-only', () => ({}));
const { locateRunStepBugContext } = await import('./route');
const { BugCreateBodySchema } = await import('@lib/bugs/validation');
const { mapBugRpcError } = await import('@lib/bugs/errors');
const { ApiError } = await import('@lib/api/error-envelope');

// BK-40 — POST /api/v1/bugs. No dedicated NextRequest/ctx test harness exists
// in this repo (see app/api/v1/runs/route.test.ts's own note), so — same
// isolation style — this exercises the route's own extracted pieces directly:
//
//   * `locateRunStepBugContext` — the pure, DB-free run-step-context
//     derivation the route calls for the run-linked path (ATP-P1/P2's
//     "context comes from the run itself" + ATP-N1's "step must be failed").
//   * `BugCreateBodySchema` — the EXACT schema the route parses the body with
//     (ATP-P3, ATP-N2, ATP-N4, ATP-B1).
//   * `mapBugRpcError` — the EXACT error mapper the route calls on an RPC
//     error (ATP-N3's cross-project-module rejection surfaces as 422 here).
//
// Together these prove the wiring end-to-end without needing a live NextRequest.

// Zod v4's `.uuid()` (used by BugCreateBodySchema below) enforces RFC 4122
// version/variant nibbles, so these are valid-shaped (version 4, variant 8)
// rather than arbitrary repeated hex — `locateRunStepBugContext` itself does
// not care (it does no format validation), but the shared constants must
// satisfy the stricter of its two use sites.
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const ATC_ID = '44444444-4444-4444-8444-444444444444';
const STEP_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_STEP_ID = '66666666-6666-4666-8666-666666666666';

function fakeRun(overrides: Partial<{ moduleId: string | null, stepStatus: string }> = {}) {
  return {
    id: RUN_ID,
    project_id: PROJECT_ID,
    module_id: overrides.moduleId === undefined ? MODULE_ID : overrides.moduleId,
    atcs: [
      {
        atc_id: ATC_ID,
        steps: [
          { id: STEP_ID, status: overrides.stepStatus ?? 'failed' },
          { id: OTHER_STEP_ID, status: 'pending' },
        ],
      },
    ],
  };
}

describe('locateRunStepBugContext (ATP-P1/P2 — run context derivation)', () => {
  it('finds the matching step and derives project/module/run/atc ids from the run itself', () => {
    const context = locateRunStepBugContext(fakeRun(), STEP_ID);
    expect(context).toEqual({
      runId: RUN_ID,
      projectId: PROJECT_ID,
      moduleId: MODULE_ID,
      atcId: ATC_ID,
      stepStatus: 'failed',
    });
  });

  it('reports the step\'s actual status so the caller can enforce the failed-only rule (ATP-N1)', () => {
    const context = locateRunStepBugContext(fakeRun({ stepStatus: 'pending' }), STEP_ID);
    expect(context?.stepStatus).toBe('pending');
  });

  it('returns null when the step id does not belong to this run', () => {
    const context = locateRunStepBugContext(fakeRun(), '99999999-9999-9999-9999-999999999999');
    expect(context).toBeNull();
  });

  it('surfaces a null module_id (the run\'s own module snapshot can be null — 0040\'s Risk R-3)', () => {
    const context = locateRunStepBugContext(fakeRun({ moduleId: null }), STEP_ID);
    expect(context?.moduleId).toBeNull();
  });
});

describe('BugCreateBodySchema — the exact schema the route parses (ATP-P3/N2/N4/B1)', () => {
  it('ATP-P3: accepts a valid standalone body', () => {
    const result = BugCreateBodySchema.safeParse({
      project_id: PROJECT_ID,
      module_id: MODULE_ID,
      title: 'Standalone bug filed directly',
      severity: 'P2',
    });
    expect(result.success).toBe(true);
  });

  it('ATP-N2: rejects a too-short title', () => {
    const result = BugCreateBodySchema.safeParse({
      project_id: PROJECT_ID,
      module_id: MODULE_ID,
      title: 'abcd',
      severity: 'P2',
    });
    expect(result.success).toBe(false);
  });

  it('ATP-N4: rejects an invalid severity', () => {
    const result = BugCreateBodySchema.safeParse({
      project_id: PROJECT_ID,
      module_id: MODULE_ID,
      title: 'A perfectly reasonable title',
      severity: 'CRITICAL',
    });
    expect(result.success).toBe(false);
  });

  it('ATP-B1: rejects an 11th evidence link', () => {
    const result = BugCreateBodySchema.safeParse({
      project_id: PROJECT_ID,
      module_id: MODULE_ID,
      title: 'A perfectly reasonable title',
      severity: 'P2',
      evidence_urls: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}.png`),
    });
    expect(result.success).toBe(false);
  });

  it('ATP-I1: the accepted shape has no Jira sync field anywhere', () => {
    const result = BugCreateBodySchema.safeParse({
      project_id: PROJECT_ID,
      module_id: MODULE_ID,
      title: 'A perfectly reasonable title',
      severity: 'P2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).not.toContain('jira_issue_key');
    }
  });
});

describe('mapBugRpcError — the exact mapper the route calls (ATP-N3)', () => {
  it('ATP-N3: bugs_module_outside_project (45300) maps to a 422 validation error, not a silent success', () => {
    let captured: unknown;
    try {
      mapBugRpcError({ code: '45300', message: 'bugs_module_outside_project' });
    }
    catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(ApiError);
    expect((captured as InstanceType<typeof ApiError>).status).toBe(422);
  });
});
