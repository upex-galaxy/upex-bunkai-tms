// Framework-agnostic User-Story validation helpers (BK-14). No React/Next/DB
// imports — usable from the route handlers and unit tests alike. Failure reasons
// use the hybrid-error `details.reason` vocabulary.

export type StoryTitleError = 'title_required' | 'title_too_short' | 'title_too_long';

export const MIN_STORY_TITLE = 3;
export const MAX_STORY_TITLE = 200;
// 50 KB UTF-8 (decimal — 50,000 bytes, NOT KiB), shared with the BK-16 editor
// cap. The former 50 * 1024 admitted 50,001–51,200-byte payloads (BK-99).
export const MAX_STORY_DESCRIPTION_BYTES = 50_000;

// Validate a story title (the server trims first). Returns the granular reason,
// or null when the trimmed title is acceptable.
export function storyTitleError(title: string): StoryTitleError | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return 'title_required';
  }
  if (trimmed.length < MIN_STORY_TITLE) {
    return 'title_too_short';
  }
  if (trimmed.length > MAX_STORY_TITLE) {
    return 'title_too_long';
  }
  return null;
}

const JIRA_KEY = /^[A-Z]+-\d+$/;

// Canonical form of a Jira key for storage + uniqueness comparison: trimmed and
// upper-cased (the DB unique index compares on upper(external_id) too).
export function normalizeJiraKey(key: string): string {
  return key.trim().toUpperCase();
}

// Returns 'external_id_invalid' when a non-empty key does not read as
// LETTERS-NUMBER (e.g. BK-42); null when the key is empty (optional) or valid.
export function jiraKeyError(key: string): 'external_id_invalid' | null {
  const normalized = normalizeJiraKey(key);
  if (normalized.length === 0) {
    return null;
  }
  return JIRA_KEY.test(normalized) ? null : 'external_id_invalid';
}
