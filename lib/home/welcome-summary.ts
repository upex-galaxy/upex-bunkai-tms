// BK-255 — the two pieces of derived copy the Home welcome banner renders: the
// signed-in member's display name, and the one-line summary of what recently
// changed in the workspace.
//
// Framework-agnostic per the Stack §10 utilities rule — no React, no Next, no
// Supabase types. The page owns the reads; this module owns the wording. The
// imports are the sibling constants module, which is itself zero-import, so
// the window the copy names and the window the page queries stay the same
// number, and the zero-import display-name readers (BK-1949), so the banner
// and Settings > Account read a name out of the auth user the same way.

import { readOwnDisplayName, readProviderName } from '@lib/account/display-name';
import { HOME_CHANGE_WINDOW_HOURS } from '@lib/home/constants';

// ---------------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------------

// Resolution order (BK-1949 Business Rule 7):
//   1. `app_metadata.display_name` — the name the person saved in Settings >
//      Account (BK-1949). Stored where no provider sign-in writes, so it wins.
//   2. `user_metadata.full_name` — set by the Google OAuth provider (BK-3).
//   3. `user_metadata.name` — the GitHub provider's spelling of the same thing.
//   4. A name derived from the email local-part, for the password and
//      magic-link paths (BK-166 / BK-2), which carry no metadata at all.
//   5. null — the caller falls back to an un-personalized greeting rather than
//      inventing a name or printing a raw email address as one.
export function resolveDisplayName(input: {
  appMetadata?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  email?: string | null
}): string | null {
  return readOwnDisplayName(input.appMetadata)
    ?? readProviderName(input.metadata)
    ?? nameFromEmail(input.email);
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
  // How many DISTINCT ATCs were touched inside the window — not how many
  // activity rows exist. Every emitting RPC writes one row per operation, so
  // an ATC opened and saved three times produces three rows; calling that
  // "3 ATCs changed" would overstate what the member has to look at.
  atcChanges: number
  // Same, for Tests (created, reordered, tags changed).
  testChanges: number
  // Runs in the workspace whose status is still `running`. Deliberately NOT
  // windowed: "currently executing" is a present-tense fact, and a run that
  // started before the window opened is still one the member would want to
  // know about (the story's Scope field words it this way).
  activeRuns: number
}

// The window phrase every clause below shares, derived from the constant the
// page queries with — the copy cannot claim a period the query did not measure.
const WINDOW_PHRASE = `in the last ${HOME_CHANGE_WINDOW_HOURS} hours`;

export function buildWelcomeSummary(input: WelcomeSummaryInput): string {
  const changed: string[] = [];
  const atcs = safeCount(input.atcChanges);
  const tests = safeCount(input.testChanges);
  if (atcs > 0) {
    changed.push(`${atcs} ${atcs === 1 ? 'ATC' : 'ATCs'}`);
  }
  if (tests > 0) {
    changed.push(`${tests} ${tests === 1 ? 'test' : 'tests'}`);
  }

  const sentences: string[] = [];
  if (changed.length > 0) {
    sentences.push(`${changed.join(' and ')} changed ${WINDOW_PHRASE}.`);
  }

  const runs = safeCount(input.activeRuns);
  if (runs > 0) {
    sentences.push(runs === 1
      ? '1 run is executing right now.'
      : `${runs} runs are executing right now.`);
  }

  // AC3 — a genuinely quiet workspace says so, in as many words, and names the
  // period it is quiet over rather than implying "since forever".
  if (sentences.length === 0) {
    return `Nothing new to review ${WINDOW_PHRASE}.`;
  }

  return sentences.join(' ');
}

// A count that arrives negative or non-finite is a bug upstream, not something
// to render — clamp rather than print "-1 ATCs changed".
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
