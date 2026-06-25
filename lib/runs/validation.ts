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
