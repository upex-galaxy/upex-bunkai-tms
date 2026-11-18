// BK-1949 — the person's own display name: one validation rule shared by the
// Settings form and the API route (Tech Lead ruling D8), plus the readers that
// pick a name out of the Supabase Auth user.
//
// Pure and zero-import on purpose: the browser bundle and the route handler
// import the SAME function, so the UI and the API cannot disagree on what a
// valid name is (trim set, length unit, refused characters).
//
// Storage (ruling D1): the own name lives in `app_metadata.display_name`. The
// browser cannot write `app_metadata` (Supabase Auth refuses it for a user
// request) and a Google or GitHub sign-in only merges its identity data into
// `user_metadata`, so a provider refresh can never replace the own name.

export const DISPLAY_NAME_MAX_CODE_POINTS = 80;

// The `app_metadata` key that holds the own name. Never `user_metadata`: any
// browser with the public client can write that one, skipping this validation.
export const DISPLAY_NAME_KEY = 'display_name';

// Product Owner ruling PO5, verbatim. Every message ends with a period, like
// the rest of the API's messages.
export const DISPLAY_NAME_COPY = {
  empty: 'The display name cannot be empty.',
  tooLong: 'The name must be at most 80 characters.',
  forbiddenCharacters: 'The display name cannot contain line breaks, tabs or hidden formatting characters.',
  notText: 'The display name must be text.',
  saved: 'Your display name was saved.',
  removed: 'Your display name was removed.',
  saveFailed: 'We couldn\'t save your name. Try again.',
  removeFailed: 'We couldn\'t remove your name. Try again.',
  sessionExpired: 'Your session has expired. Sign in again to save your name.',
  sessionExpiredRemove: 'Your session has expired. Sign in again to remove your name.',
} as const;

// Outer characters trimmed before anything else (ruling PO3): every Unicode
// whitespace (`\s` under the `u` flag covers NBSP, U+3000, tabs, line breaks
// and U+FEFF) plus the zero-width characters `\s` does not cover. All of them
// are single UTF-16 units, so the trim scans by index. Tested one character at
// a time on purpose: an anchored `[...]+$` regex backtracks quadratically on a
// long inner whitespace run (BK-1949 review), and this runs on request bodies.
const EDGE_CHAR = /[\s\u200B-\u200D\u2060]/u;

// Refused anywhere inside the trimmed name (ruling PO4): every C0/C1 control
// character (newline, tab, ...), the Unicode line and paragraph separators,
// and the bidi embedding / override / isolate controls that can reorder the
// text around the name. Ordinary right-to-left letters are NOT in this set.
const FORBIDDEN = /[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;

// Raw input longer than this is refused before any other work, so a huge body
// costs one length check. Far above 80 code points plus any honest padding.
export const DISPLAY_NAME_MAX_RAW_LENGTH = 1000;

export function trimDisplayName(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && EDGE_CHAR.test(raw[start])) {
    start += 1;
  }
  while (end > start && EDGE_CHAR.test(raw[end - 1])) {
    end -= 1;
  }
  return raw.slice(start, end);
}

// Length in code points, not UTF-16 units: an emoji counts once (ruling PO3).
export function countCodePoints(value: string): number {
  return [...value].length;
}

export type DisplayNameParse
  = | { ok: true, value: string }
    | { ok: false, message: string };

export function parseDisplayName(raw: unknown): DisplayNameParse {
  if (typeof raw !== 'string') {
    return { ok: false, message: DISPLAY_NAME_COPY.notText };
  }
  if (raw.length > DISPLAY_NAME_MAX_RAW_LENGTH) {
    return { ok: false, message: DISPLAY_NAME_COPY.tooLong };
  }
  const value = trimDisplayName(raw);
  if (value.length === 0) {
    return { ok: false, message: DISPLAY_NAME_COPY.empty };
  }
  if (FORBIDDEN.test(value)) {
    return { ok: false, message: DISPLAY_NAME_COPY.forbiddenCharacters };
  }
  if (countCodePoints(value) > DISPLAY_NAME_MAX_CODE_POINTS) {
    return { ok: false, message: DISPLAY_NAME_COPY.tooLong };
  }
  return { ok: true, value };
}

function nonEmptyString(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

// The name the person saved in Settings, or null when they never saved one
// (or removed it).
export function readOwnDisplayName(appMetadata: Record<string, unknown> | null | undefined): string | null {
  return nonEmptyString(appMetadata?.[DISPLAY_NAME_KEY]);
}

// The name a sign-in provider supplied: Google writes `full_name`, GitHub
// writes `name`. Password and magic-link accounts carry neither.
export function readProviderName(userMetadata: Record<string, unknown> | null | undefined): string | null {
  for (const key of ['full_name', 'name'] as const) {
    const value = nonEmptyString(userMetadata?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

// The name Settings > Account shows and prefills (ruling D6): the own name,
// then the provider name, then nothing. Never the email guess, so a password
// account with no saved name sees an empty field.
export function resolveAccountName(input: {
  appMetadata?: Record<string, unknown> | null
  userMetadata?: Record<string, unknown> | null
}): string | null {
  return readOwnDisplayName(input.appMetadata) ?? readProviderName(input.userMetadata);
}
