// BK-255 — the two pieces of derived copy the Home welcome banner renders: the
// signed-in member's display name, and the one-line summary of what changed in
// the workspace since they were last active.
//
// Framework-agnostic per the Stack §10 utilities rule — no React, no Next, no
// Supabase types. The page owns the reads; this module owns the wording.

// ---------------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------------

// Resolution order:
//   1. `user_metadata.full_name` — set by the Google OAuth provider (BK-3).
//   2. `user_metadata.name` — the GitHub provider's spelling of the same thing.
//   3. A name derived from the email local-part, for the password and
//      magic-link paths (BK-166 / BK-2), which carry no metadata at all.
//   4. null — the caller falls back to an un-personalized greeting rather than
//      inventing a name or printing a raw email address as one.
//
// NOTE: `IdentityCard` (BK-87, TD6) records that no code path read
// `user_metadata` at the time it was written. This is that path — the greeting
// is the first surface in the product that has a reason to want a human name,
// and reading it here does not change what Settings > Account displays.
export function resolveDisplayName(input: {
  metadata?: Record<string, unknown> | null
  email?: string | null
}): string | null {
  for (const key of ['full_name', 'name'] as const) {
    const raw = input.metadata?.[key];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return nameFromEmail(input.email);
}

// Same tokenization `emailInitials` (BK-86) already uses, so the avatar label
// and the greeting can never disagree about where one name ends and the next
// begins: strip a `+tag` suffix, split the local-part on `.`/`-`/`_`, keep the
// first two tokens that contain at least one letter, and title-case them.
// A local-part with no letters at all (`12345@x.io`) yields null.
function nameFromEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const at = email.indexOf('@');
  const localRaw = at === -1 ? email : email.slice(0, at);
  const local = localRaw.split('+')[0] ?? '';

  const tokens = local
    .split(/[.\-_]+/)
    .map(token => token.replace(/[^a-z0-9]/gi, ''))
    .filter(token => /[a-z]/i.test(token))
    .slice(0, 2);

  if (tokens.length === 0) {
    return null;
  }

  return tokens
    .map(token => token[0].toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

// ---------------------------------------------------------------------------
// "What changed since you were last here" summary
// ---------------------------------------------------------------------------

export interface WelcomeSummaryInput {
  // Activity-log entries for ATCs since the baseline (created + updated).
  atcChanges: number
  // Activity-log entries for Tests since the baseline (created, reordered,
  // tags changed).
  testChanges: number
  // Runs in the workspace whose status is still `running`. Deliberately NOT
  // windowed by the baseline: "currently executing" is a present-tense fact,
  // and a run that started before the member's last sign-in is still one they
  // would want to know about (the story's Scope field words it this way).
  activeRuns: number
  // False when the member's last-active timestamp could not be resolved. The
  // change counts are then meaningless — there is no window to count within —
  // so every "since you last signed in" clause is suppressed rather than
  // asserted against an unknown baseline.
  hasBaseline: boolean
}

export function buildWelcomeSummary(input: WelcomeSummaryInput): string {
  const changed: string[] = [];
  if (input.hasBaseline) {
    const atcs = safeCount(input.atcChanges);
    const tests = safeCount(input.testChanges);
    if (atcs > 0) {
      changed.push(`${atcs} ${atcs === 1 ? 'ATC' : 'ATCs'}`);
    }
    if (tests > 0) {
      changed.push(`${tests} ${tests === 1 ? 'test' : 'tests'}`);
    }
  }

  const sentences: string[] = [];
  if (changed.length > 0) {
    sentences.push(`${changed.join(' and ')} changed since you last signed in.`);
  }

  const runs = safeCount(input.activeRuns);
  if (runs > 0) {
    sentences.push(runs === 1
      ? '1 run is executing right now.'
      : `${runs} runs are executing right now.`);
  }

  // AC3 — a genuinely quiet workspace says so, in as many words. The wording
  // splits on whether a baseline exists so the quiet state never claims a
  // comparison it could not actually make.
  if (sentences.length === 0) {
    return input.hasBaseline
      ? 'Nothing new to review since you last signed in.'
      : 'Nothing new to review right now.';
  }

  return sentences.join(' ');
}

// A count that arrives negative or non-finite is a bug upstream, not something
// to render — clamp rather than print "-1 ATCs changed".
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
