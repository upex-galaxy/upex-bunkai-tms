import { ATC_TITLE_MAX, ATC_TITLE_MIN, MAX_ATC_TAGS } from '@lib/atcs/validation';

// BK-19 — pure, framework-agnostic guards for the ATC creation builder. They
// mirror the BK-18 server limits (single source of truth = `@lib/atcs/validation`)
// so the client surfaces the same boundaries the API enforces, with friendly
// messages, before a request is ever sent. Kept side-effect-free for unit tests.

export const TITLE_MESSAGE = `Title must be between ${ATC_TITLE_MIN} and ${ATC_TITLE_MAX} characters.`;
export const TAG_CAP_MESSAGE = `An ATC can have at most ${MAX_ATC_TAGS} tags.`;
export const PROVENANCE_MESSAGE = 'An ATC needs a User Story and at least one Acceptance Criterion.';
export const STEPS_MESSAGE = 'At least one step is required.';
export const MODULE_MESSAGE = 'Pick a Module for this ATC.';

/** A title is valid when its trimmed length sits within the BK-18 bounds. */
export function titleValid(title: string): boolean {
  const length = title.trim().length;
  return length >= ATC_TITLE_MIN && length <= ATC_TITLE_MAX;
}

/** True once the tag list has reached the cap — the next add must be refused. */
export function tagCapReached(tags: string[]): boolean {
  return tags.length >= MAX_ATC_TAGS;
}

/**
 * Whether `candidate` can join `tags`: non-empty, not a duplicate, and under the
 * cap. Comparison is done on the normalized (trimmed, lower-cased) value, the
 * same shape the editor stores.
 */
export function canAddTag(tags: string[], candidate: string): boolean {
  const normalized = candidate.trim().toLowerCase();
  if (normalized.length === 0) { return false; }
  if (tags.includes(normalized)) { return false; }
  return !tagCapReached(tags);
}

/** Provenance is satisfied with one User Story and at least one of its ACs. */
export function provenanceOk(storyId: string | null, acIds: string[]): boolean {
  return !!storyId && acIds.length >= 1;
}

/** The builder requires at least one parsed step before it can be saved. */
export function hasMinimumSteps(stepCount: number): boolean {
  return stepCount >= 1;
}
