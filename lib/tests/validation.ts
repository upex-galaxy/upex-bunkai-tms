import { z } from 'zod';

// BK-27 — Test create request validation. The Zod layer mirrors the
// `bunkai_create_test` RPC rulebook (trim-then-validate title, chain >= 1) so
// malformed bodies fail fast as a 422 before any DB round-trip; the RPC stays
// the enforcement point of record.

export const TEST_TITLE_MAX = 200;

// UI-only soft cap — the server imposes no chain-length limit (Decision 9).
export const TEST_CHAIN_UI_SOFT_CAP = 100;

export const TestCreateBodySchema = z.object({
  title: z.string().trim().min(1).max(TEST_TITLE_MAX),
  // Duplicates are legal — a chain is a sequence, not a set.
  atc_ids: z.array(z.string().uuid()).min(1),
  // Session callers resolve the active workspace from the cookie; PAT callers
  // must send it explicitly.
  workspace_id: z.string().uuid().optional(),
});

// BK-28 — Test chain reorder request validation. The body is the COMPLETE new
// order as an array of `step_id`s (test_steps.id), NOT atc_ids: a chain may hold
// the same atc_id at multiple positions, so step_id is the only stable per-row
// handle (it is also the read path's `step_id`, 0025). Zod only validates the
// SHAPE (an array of uuid strings); the domain rules — non-empty + no duplicate
// step ids — are checked in the route via `reorderStructuralError` so they
// surface as `chain_invalid` (422) rather than the generic `validation_failed`.
// Set equality against the Test's actual steps is enforced in the route
// (`chainDiff`) and, authoritatively, under lock inside the RPC.
export const TestReorderBodySchema = z.object({
  step_ids: z.array(z.string().uuid()),
});

export type TestReorderBody = z.infer<typeof TestReorderBodySchema>;

// Structural validation of the submitted order. Returns a reason string for the
// `chain_invalid` body, or null when the array is structurally sound. Set
// equality is a separate concern (`chainDiff` → chain_mismatch).
export function reorderStructuralError(stepIds: string[]): 'empty' | 'duplicate' | null {
  if (stepIds.length === 0) {
    return 'empty';
  }
  if (new Set(stepIds).size !== stepIds.length) {
    return 'duplicate';
  }
  return null;
}

// BK-33 — Test tags request validation. The body replaces the WHOLE tag set
// (PUT semantics): `{ tags: string[] }`. The Zod layer mirrors the
// `bunkai_set_test_tags` RPC SHAPE rules (each tag trimmed-non-empty after the
// transform, ≤ 50 chars, comma-free, ≤ 20 tags) so malformed bodies fail fast
// as a 422 before any DB round-trip; the RPC stays the enforcement point of
// record (and owns reserved-lowercase + dedupe, which the client need not
// replicate). The transform trims and drops blank entries so the count/shape
// checks run on the values the RPC will actually store.

export const TEST_TAG_MAX_LEN = 50;
export const TEST_TAGS_MAX_COUNT = 20;

// Reserved suite tags — lowercased by the RPC. Exposed for the editor's
// quick-add chips (custom tags preserve casing; reserved ones do not).
export const RESERVED_TEST_TAGS = ['smoke', 'sanity', 'regression'] as const;

export const TestTagsBodySchema = z.object({
  tags: z
    .array(z.string())
    // Trim + drop blank entries up front so length/count rules match the RPC's
    // post-normalization view (the RPC also reserved-lowercases + dedupes).
    .transform(tags => tags.map(t => t.trim()).filter(t => t.length > 0))
    .pipe(
      z
        .array(
          z
            .string()
            .max(TEST_TAG_MAX_LEN)
            .refine(t => !t.includes(','), { message: 'Tags must not contain commas.' }),
        )
        .max(TEST_TAGS_MAX_COUNT),
    ),
});

export type TestTagsBody = z.infer<typeof TestTagsBodySchema>;

// Multiset diff between the Test's current step_ids and the submitted order.
// `missing` = in the Test but absent from the submission; `extra` = submitted
// but not part of the Test. Either non-empty ⇒ chain_mismatch (422). Order is
// irrelevant here — reorder is a permutation, so only the SET must match.
export function chainDiff(current: string[], submitted: string[]): { missing: string[], extra: string[] } {
  const currentSet = new Set(current);
  const submittedSet = new Set(submitted);
  return {
    missing: current.filter(id => !submittedSet.has(id)),
    extra: submitted.filter(id => !currentSet.has(id)),
  };
}
