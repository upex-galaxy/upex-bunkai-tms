import { byteLength } from '@lib/markdown/format';
import { z } from 'zod';

// BK-18 — ATC request validation. Two layers: the Zod schemas below shape the
// POST/PATCH bodies (lenient enough that semantic failures surface as specific
// API error codes rather than a generic ZodError), and `stepPositionsError`
// enforces the strictly-increasing-from-1 rule.

export const ATC_LAYERS = ['UI', 'API', 'Unit'] as const;

// Per-field content budget (UTF-8 bytes ≈ 2 KB Markdown). Enforced with
// byteLength (not Zod `.max`, which counts UTF-16 units) so multibyte input is
// measured the same way as every sibling write route.
export const MAX_ATC_CONTENT_BYTES = 2048;
export const MAX_ATC_TAGS = 10;
export const ATC_TITLE_MIN = 3;
export const ATC_TITLE_MAX = 200;

const withinContentBudget = (value: string): boolean => byteLength(value) <= MAX_ATC_CONTENT_BYTES;
const CONTENT_BYTES_MESSAGE = `Content must be at most ${MAX_ATC_CONTENT_BYTES} bytes.`;

export const AtcStepInputSchema = z.object({
  position: z.number(),
  content: z.string().min(1).refine(withinContentBudget, { message: CONTENT_BYTES_MESSAGE }),
  input_data: z.string().refine(withinContentBudget, { message: CONTENT_BYTES_MESSAGE }).nullable().optional(),
  expected: z.string().refine(withinContentBudget, { message: CONTENT_BYTES_MESSAGE }).nullable().optional(),
});

export const AtcAssertionInputSchema = z.object({
  content: z.string().min(1).refine(withinContentBudget, { message: CONTENT_BYTES_MESSAGE }),
});

// Shared body shape for create and (full-replace) edit. PATCH reuses it because
// edits are PUT-style — omitted children are cleared, not merged.
export const AtcWriteBodySchema = z.object({
  title: z.string().min(ATC_TITLE_MIN).max(ATC_TITLE_MAX),
  layer: z.enum(ATC_LAYERS),
  tags: z.array(z.string()).max(MAX_ATC_TAGS).optional().default([]),
  steps: z.array(AtcStepInputSchema).min(1),
  assertions: z.array(AtcAssertionInputSchema).optional().default([]),
  acceptance_criterion_ids: z.array(z.string().uuid()).min(1),
});

export const AtcCreateBodySchema = AtcWriteBodySchema.extend({
  module_id: z.string().uuid(),
  user_story_id: z.string().uuid(),
});

// PATCH is full-replace; user_story_id/module_id are immutable so they are
// accepted-and-ignored (a client GET→edit→PATCH round-trip may echo them back).
export const AtcUpdateBodySchema = AtcWriteBodySchema.extend({
  user_story_id: z.string().uuid().optional(),
  module_id: z.string().uuid().optional(),
});

// BK-23 — duplicate body. Only an optional title (reusing the 3–200 rule); the
// server reads everything else from the source ATC. An empty body is valid and
// defaults the copy's title to `<source> (copy)`.
export const AtcDuplicateBodySchema = z.object({
  title: z.string().min(ATC_TITLE_MIN).max(ATC_TITLE_MAX).optional(),
});

// BK-23 — default title for a duplicate when the caller supplies none. Single
// ` (copy)` suffix, no de-dup (PO-PENDING: duplicating a copy yields
// `… (copy) (copy)`). The RPC re-derives this server-side; this helper keeps the
// rule unit-testable and lets a UI preview the default before the round-trip.
export function defaultCopyTitle(sourceTitle: string): string {
  return `${sourceTitle} (copy)`;
}

export interface StepPositionsError {
  reason: 'steps_position_invalid'
  positions: number[]
}

// Positions must be integers, strictly increasing, starting at 1. Gaps are
// allowed (e.g. [1, 2, 5]) and persisted as-is by the RPC. Returns the
// offending positions (the response body lists them) or null when valid.
export function stepPositionsError(steps: { position: number }[]): StepPositionsError | null {
  const positions = steps.map(s => s.position);
  const offending: number[] = [];
  positions.forEach((value, index) => {
    const previous = positions[index - 1];
    const bad = !Number.isInteger(value)
      || (index === 0 ? value !== 1 : value <= (previous ?? 0));
    if (bad) {
      offending.push(value);
    }
  });
  return offending.length > 0 ? { reason: 'steps_position_invalid', positions: offending } : null;
}
