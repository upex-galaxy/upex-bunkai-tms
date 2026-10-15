// BK-371 — the dependency-free rules and frozen copy shared by the server
// (`validation.ts`, the routes, the connection check) AND the settings screen.
// It imports nothing on purpose: `validation.ts` pulls `ApiError` and therefore
// `next/server`, which must not reach a client bundle, while the screen needs the
// same key rule and the same words the server answers with.
//
// The key is normalised (trim + ASCII-only upper-case) and tested against the
// Jira key shape BEFORE any network call (T4): a free-text key reaching a URL
// is an injection path. ASCII-only on purpose: `'ß'.toUpperCase()` is 'SS'.

export const DESTINATION_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,9}$/;
export const ISSUE_TYPE_MAX = 60;
export const DEFAULT_ISSUE_TYPE = 'Bug';

// Frozen copy (PO Q2/Q3, Dev T4/T9). Never reworded without a ruling.
export const TRACKER_SETTINGS_MESSAGES = {
  invalid_destination_key: 'Use 2 to 10 capital letters, digits or underscores, starting with a letter.',
  destination_required: 'Enter a Jira project key.',
  invalid_issue_type: 'Issue type must be 1 to 60 characters.',
  admin_required: 'You no longer have permission to change this. Reload to see the current settings.',
} as const;

export type TrackerSettingsValidationReason
  = | 'invalid_destination_key'
    | 'destination_required'
    | 'invalid_issue_type';

// Trim, then upper-case a-z only. Anything else (accents, sharp s, full-width
// letters) is left alone and therefore fails the pattern.
export function normalizeDestinationKey(raw: string): string {
  return raw.trim().replace(/[a-z]/g, letter => letter.toUpperCase());
}
