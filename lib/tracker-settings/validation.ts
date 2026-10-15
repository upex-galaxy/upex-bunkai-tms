import type { z as zod } from 'zod';
import { ApiError } from '@lib/api/error-envelope';
import { z } from 'zod';

// BK-371 — request-body validation for the Jira defect-sync settings (PUT) and
// the connection check (POST .../check). Server AND screen import the frozen
// copy and the key normaliser from here, so the three layers (screen, route,
// `bunkai_upsert_project_tracker_settings` + the table CHECK) cannot drift.
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

function rejectWith(ctx: zod.RefinementCtx, reason: TrackerSettingsValidationReason): void {
  ctx.addIssue({
    code: 'custom',
    message: TRACKER_SETTINGS_MESSAGES[reason],
    params: { reason },
  });
}

const DestinationKeySchema = z
  .string()
  .optional()
  .default('')
  .transform(normalizeDestinationKey)
  .superRefine((key, ctx) => {
    if (key === '') {
      rejectWith(ctx, 'destination_required');
    }
    else if (!DESTINATION_KEY_PATTERN.test(key)) {
      rejectWith(ctx, 'invalid_destination_key');
    }
  });

// Same unit as the SQL `char_length`: code points, not UTF-16 units (an emoji is
// 2 units in JS and 1 character in Postgres).
function codePointLength(value: string): number {
  return [...value].length;
}

const IssueTypeSchema = z
  .string()
  .optional()
  .default(DEFAULT_ISSUE_TYPE)
  .transform(value => value.trim())
  .superRefine((value, ctx) => {
    const length = codePointLength(value);
    if (length < 1 || length > ISSUE_TYPE_MAX) {
      rejectWith(ctx, 'invalid_issue_type');
    }
  });

// The connection check only needs the typed (possibly unsaved) pair.
export const TrackerSettingsCheckBodySchema = z.object({
  destination_project_key: DestinationKeySchema,
  issue_type_name: IssueTypeSchema,
});

// PUT adds the switch and the confirmation of the queue size the user saw.
export const TrackerSettingsBodySchema = TrackerSettingsCheckBodySchema.extend({
  enabled: z.boolean(),
  confirm_queue_count: z.number().int().min(0).optional(),
});

export type TrackerSettingsCheckBody = z.infer<typeof TrackerSettingsCheckBodySchema>;
export type TrackerSettingsBody = z.infer<typeof TrackerSettingsBodySchema>;

function isReason(value: unknown): value is TrackerSettingsValidationReason {
  return value === 'invalid_destination_key' || value === 'destination_required' || value === 'invalid_issue_type';
}

// Parse a request body, answering the first failure as a 422 `validation_failed`
// whose `details.reason` is one of the frozen reason codes. Throws; never echoes
// the offending value back.
export function parseTrackerSettingsBody<T extends zod.ZodType>(schema: T, payload: unknown): zod.infer<T> {
  const result = schema.safeParse(payload);
  if (result.success) {
    return result.data;
  }
  const first = result.error.issues[0];
  const params = first && 'params' in first ? (first.params as { reason?: unknown } | undefined) : undefined;
  if (isReason(params?.reason)) {
    throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES[params.reason], {
      details: { reason: params.reason },
    });
  }
  const path = first?.path[0];
  if (path === 'destination_project_key') {
    throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES.invalid_destination_key, {
      details: { reason: 'invalid_destination_key' },
    });
  }
  if (path === 'issue_type_name') {
    throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES.invalid_issue_type, {
      details: { reason: 'invalid_issue_type' },
    });
  }
  throw new ApiError('validation_failed', 'Request body failed validation.', {
    details: { reason: 'invalid_body', field: typeof path === 'string' ? path : null },
  });
}
