// Framework-agnostic Acceptance-Criterion validation helpers (BK-15). No
// React/Next/DB imports — usable from the route handlers and unit tests alike.
// Failure reasons use the hybrid-error `details.reason` vocabulary. Mirrors the
// user-story helpers (the title rule is identical: 3-200 characters).

export type CriterionTitleError = 'title_required' | 'title_too_short' | 'title_too_long';

export const MIN_CRITERION_TITLE = 3;
export const MAX_CRITERION_TITLE = 200;
// 50 KB UTF-8, shared with the BK-16 editor cap.
export const MAX_CRITERION_DESCRIPTION_BYTES = 50 * 1024;

// Validate a criterion title (the server trims first). Returns the granular
// reason, or null when the trimmed title is acceptable.
export function criterionTitleError(title: string): CriterionTitleError | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return 'title_required';
  }
  if (trimmed.length < MIN_CRITERION_TITLE) {
    return 'title_too_short';
  }
  if (trimmed.length > MAX_CRITERION_TITLE) {
    return 'title_too_long';
  }
  return null;
}
