import { ApiError } from '@lib/api/error-envelope';

// BK-222 — request validation for POST /api/v1/runs/submissions. Hand-written
// rather than a bare Zod parse because the acceptance criteria freeze messages
// the generic ZodError envelope ("Request body failed validation.") cannot give:
// AC-5 lists the accepted values, AC-6 names the inconsistency, the evidence
// rule names the offending entry. `bunkai_submit_automated_run` re-checks every
// rule below as its backstop, and owns the two rules that need the Test:
// step coverage (AC-4) and the environment (AC-8).

export const SUBMISSION_VERDICTS = ['passed', 'failed'] as const;
export const SUBMISSION_STEP_RESULTS = ['pass', 'fail', 'block'] as const;
export const SUBMISSION_DURATION_MAX_SECONDS = 86400;
export const SUBMISSION_EVIDENCE_MAX = 20;
export const SUBMISSION_EVIDENCE_URL_MAX = 2048;
export const SUBMISSION_KEY_MAX = 64;
export const SUBMISSION_ENVIRONMENT_MAX = 60;

export type SubmissionVerdict = (typeof SUBMISSION_VERDICTS)[number];
export type SubmissionStepResult = (typeof SUBMISSION_STEP_RESULTS)[number];

export interface SubmissionStep {
  position: number
  result: SubmissionStepResult
}

export interface RunSubmissionBody {
  test_id: string
  environment: string
  verdict: SubmissionVerdict
  duration_seconds: number
  steps: SubmissionStep[]
  evidence_urls: string[]
  idempotency_key?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(reason: string, message: string, extra: Record<string, unknown> = {}): never {
  throw new ApiError('validation_failed', message, { details: { reason, ...extra } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHttpUrl(value: string): boolean {
  if (value.length > SUBMISSION_EVIDENCE_URL_MAX || /\s/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  }
  catch {
    return false;
  }
}

// Throws an AC-exact `validation_failed` ApiError on the first broken rule.
export function parseRunSubmissionBody(payload: unknown): RunSubmissionBody {
  if (!isRecord(payload)) {
    return invalid('body_invalid', 'Request body must be a JSON object.');
  }

  const testId = payload.test_id;
  if (typeof testId !== 'string' || !UUID_RE.test(testId)) {
    return invalid('test_id_invalid', 'test_id must be a valid UUID.');
  }

  const environment = typeof payload.environment === 'string' ? payload.environment.trim() : '';
  if (environment.length < 1 || environment.length > SUBMISSION_ENVIRONMENT_MAX) {
    return invalid(
      'environment_invalid',
      `environment must be the name of a Project environment (1 to ${SUBMISSION_ENVIRONMENT_MAX} characters).`,
    );
  }

  const verdict = payload.verdict;
  if (typeof verdict !== 'string' || !(SUBMISSION_VERDICTS as readonly string[]).includes(verdict)) {
    return invalid(
      'verdict_invalid',
      `verdict must be one of: ${SUBMISSION_VERDICTS.join(', ')}.`,
      { accepted: SUBMISSION_VERDICTS },
    );
  }

  const duration = payload.duration_seconds;
  if (
    typeof duration !== 'number'
    || !Number.isInteger(duration)
    || duration < 0
    || duration > SUBMISSION_DURATION_MAX_SECONDS
  ) {
    return invalid(
      'duration_invalid',
      `duration_seconds must be a whole number of seconds between 0 and ${SUBMISSION_DURATION_MAX_SECONDS}.`,
    );
  }

  const rawSteps = payload.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return invalid('steps_invalid', 'steps must be a non-empty list of { position, result } entries.');
  }
  const steps: SubmissionStep[] = [];
  const seen = new Set<number>();
  const duplicates: number[] = [];
  for (const [index, entry] of rawSteps.entries()) {
    if (!isRecord(entry) || !Number.isInteger(entry.position) || (entry.position as number) < 1) {
      return invalid(
        'steps_invalid',
        `steps[${index}].position must be a whole chain position starting at 1.`,
        { index },
      );
    }
    const result = entry.result;
    if (typeof result !== 'string' || !(SUBMISSION_STEP_RESULTS as readonly string[]).includes(result)) {
      return invalid(
        'step_result_invalid',
        `steps[${index}].result must be one of: ${SUBMISSION_STEP_RESULTS.join(', ')}.`,
        { index, accepted: SUBMISSION_STEP_RESULTS },
      );
    }
    const position = entry.position as number;
    if (seen.has(position)) {
      duplicates.push(position);
    }
    seen.add(position);
    steps.push({ position, result: result as SubmissionStepResult });
  }
  if (duplicates.length > 0) {
    return invalid(
      'steps_duplicate_position',
      `Each step position may be reported once; repeated: ${duplicates.join(', ')}.`,
      { duplicate_positions: duplicates },
    );
  }

  // AC-6: the stored run must read like a manual one, where the verdict derives
  // from its steps. Contradictions are rejected, never auto-corrected.
  const notPassing = steps.filter(s => s.result !== 'pass').map(s => s.position);
  if (verdict === 'passed' && notPassing.length > 0) {
    return invalid(
      'verdict_inconsistent',
      `Verdict "passed" is inconsistent with the step results: positions ${notPassing.join(', ')} are not pass.`,
      { verdict, non_passing_positions: notPassing },
    );
  }
  if (verdict === 'failed' && notPassing.length === 0) {
    return invalid(
      'verdict_inconsistent',
      'Verdict "failed" is inconsistent with the step results: at least one step must be fail or block.',
      { verdict },
    );
  }

  const rawEvidence = payload.evidence_urls ?? [];
  if (!Array.isArray(rawEvidence)) {
    return invalid('evidence_invalid', 'evidence_urls must be a list of http or https URLs.');
  }
  if (rawEvidence.length > SUBMISSION_EVIDENCE_MAX) {
    return invalid(
      'evidence_too_many',
      `evidence_urls accepts at most ${SUBMISSION_EVIDENCE_MAX} entries.`,
      { max: SUBMISSION_EVIDENCE_MAX },
    );
  }
  const evidence: string[] = [];
  for (const [index, entry] of rawEvidence.entries()) {
    if (typeof entry !== 'string' || !isHttpUrl(entry)) {
      return invalid(
        'evidence_url_invalid',
        `evidence_urls[${index}] is not a valid http or https URL of at most ${SUBMISSION_EVIDENCE_URL_MAX} characters.`,
        { index },
      );
    }
    evidence.push(entry);
  }

  let idempotencyKey: string | undefined;
  if (payload.idempotency_key !== undefined && payload.idempotency_key !== null) {
    const key = payload.idempotency_key;
    if (typeof key !== 'string' || key.length < 1 || key.length > SUBMISSION_KEY_MAX) {
      return invalid(
        'idempotency_key_invalid',
        `idempotency_key must be between 1 and ${SUBMISSION_KEY_MAX} characters.`,
      );
    }
    idempotencyKey = key;
  }

  return {
    test_id: testId,
    environment,
    verdict: verdict as SubmissionVerdict,
    duration_seconds: duration,
    steps,
    evidence_urls: evidence,
    idempotency_key: idempotencyKey,
  };
}
