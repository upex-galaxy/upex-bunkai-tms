import { z } from 'zod';

// BK-34 — Start-run request validation. The Zod layer mirrors the
// `bunkai_create_run` RPC rulebook (test_id + environment_id are uuids, executor
// mode is one of the allowed values, start_token is a bounded non-empty string)
// so malformed bodies fail fast as a 422 before any DB round-trip; the RPC stays
// the enforcement point of record (it re-validates env containment, the
// executable-steps gate, and the 24h idempotency window under lock).

// Mirrors runs.executor_mode CHECK in 0031_runs.sql.
export const RUN_EXECUTOR_MODES = ['human', 'agent', 'ci'] as const;

// Mirrors runs.start_token CHECK (char_length between 1 and 200) in 0031_runs.sql.
export const RUN_START_TOKEN_MAX = 200;

export const RunCreateBodySchema = z.object({
  test_id: z.string().uuid(),
  environment_id: z.string().uuid(),
  // Optional: cookie sessions are unambiguously `human`; a PAT (bearer) caller may
  // declare `agent` / `ci`. The route derives the effective mode (see route.ts).
  executor_mode: z.enum(RUN_EXECUTOR_MODES).optional(),
  // Domain idempotency token (distinct from the HTTP Idempotency-Key header). A
  // same (test_id, start_token) within 24h returns the existing Run. Optional in
  // the body — the route mints one when absent so each fresh start is unique.
  start_token: z.string().trim().min(1).max(RUN_START_TOKEN_MAX).optional(),
});

export type RunCreateBody = z.infer<typeof RunCreateBodySchema>;

// BK-36 — abort-run reason bounds. Mirrors the runs_abort_reason_chk CHECK in
// 0036_run_abort.sql (trimmed length 3..500) and the bunkai_abort_run backstop.
export const RUN_ABORT_REASON_MIN = 3;
export const RUN_ABORT_REASON_MAX = 500;

// AC-exact frozen copy. The HTTP route surfaces these VERBATIM (never via the
// generic ZodError envelope) so the client renders the agreed messages.
export const RUN_ABORT_REASON_TOO_SHORT_MESSAGE = `Please give a reason of at least ${RUN_ABORT_REASON_MIN} characters`;
export const RUN_ABORT_REASON_TOO_LONG_MESSAGE = `The reason must be at most ${RUN_ABORT_REASON_MAX} characters`;

// BK-36 — abort request validation. The reason is trimmed then bounded 3..500.
// The route parses with safeParse and throws an AC-exact message rather than the
// generic validation envelope (handler.ts maps ZodError to a fixed string).
export const RunAbortBodySchema = z.object({
  reason: z.string().trim().min(RUN_ABORT_REASON_MIN).max(RUN_ABORT_REASON_MAX),
});

export type RunAbortBody = z.infer<typeof RunAbortBodySchema>;

// BK-39 — finish-run final verdict. Mirrors the bunkai_finish_run verdict
// backstop in 0037_run_finish.sql (passed | failed only; 'aborted' is its own
// action — abort, BK-36). The route parses with safeParse and throws the AC-exact
// "verdict required" copy rather than the generic ZodError envelope.
export const RUN_FINISH_VERDICTS = ['passed', 'failed'] as const;

// AC-exact frozen copy. The negative-path AC requires a clear message that a
// final verdict is required to finish; the HTTP route surfaces this VERBATIM
// (never via the generic ZodError envelope).
export const RUN_FINISH_VERDICT_REQUIRED_MESSAGE = 'Select a final verdict of passed or failed to finish the run.';

// BK-39 — finish request validation. The verdict must be one of passed | failed.
// The route parses with safeParse and throws the AC-exact message above on any
// miss (absent, null, or out-of-enum) rather than the generic validation envelope.
export const RunFinishBodySchema = z.object({
  verdict: z.enum(RUN_FINISH_VERDICTS),
});

export type RunFinishBody = z.infer<typeof RunFinishBodySchema>;

// BK-35 — mark-step request validation. Mirrors the bunkai_mark_run_step
// backstop (0042_run_step_mark.sql): status is one of passed/failed/blocked
// only — 'pending' is never accepted, so a re-mark-to-pending attempt is
// rejected here, at the HTTP edge, before it would reach the RPC's own 45213
// backstop. No AC freezes copy for a malformed body here (unlike Q2's abort
// reason), so the generic ZodError envelope (handler.ts) is fine.
//
// BK-466 — this schema, NOT lib/runs/mark-step-view.ts's client-side
// convenience check, is the actual write-time enforcement point of record: a
// bearer-token (`run:execute`) caller hits this route directly and never
// goes through the React form. `evidence_url` below used to validate with a
// bare `.url()` (any parseable scheme, including javascript:/data: — same
// gap `isValidUrl`, lib/utils/url.ts, has), and the RPC itself
// (0042_run_step_mark.sql) only trims/normalizes, it never checks scheme
// either — so a direct API caller could plant a hostile evidence_url with
// nothing downstream to stop it. Tightened to the same `isHttpUrl` allowlist
// (protocol: z.regexes.httpProtocol) BK-337 already applies to
// lib/bugs/validation.ts's evidenceUrlsSchema, so all three surfaces
// (render, UI-form, API edge) agree on what counts as an openable link.
export const RUN_STEP_STATUSES = ['passed', 'failed', 'blocked'] as const;

// Generic cap — no existing length-CHECK precedent in the Runs domain
// (content/expected/test_title are all uncapped at the DB, D7), so this is a
// Zod-only default, not a mirror of a DB constraint.
export const RUN_STEP_NOTE_MAX = 2000;
export const RUN_STEP_EVIDENCE_URL_MAX = 2000;

// Q8/ATP — an empty or whitespace-only note/evidence_url normalizes to null
// rather than being rejected (the RPC does the SAME normalization server-side
// via nullif(btrim(...)), so this is a client-side convenience, not the sole
// enforcement point — a direct RPC caller is still covered). Applied via
// preprocess so `.url()` never sees an empty string as a value to validate.
function emptyStringToNull(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

export const RunStepMarkBodySchema = z.object({
  status: z.enum(RUN_STEP_STATUSES),
  note: z.preprocess(
    emptyStringToNull,
    z.string().trim().max(RUN_STEP_NOTE_MAX).nullable().optional(),
  ),
  evidence_url: z.preprocess(
    emptyStringToNull,
    z.string().trim().max(RUN_STEP_EVIDENCE_URL_MAX).url({ protocol: z.regexes.httpProtocol }).nullable().optional(),
  ),
});

export type RunStepMarkBody = z.infer<typeof RunStepMarkBodySchema>;
