import type { z as zod } from 'zod';
import type { TrackerSettingsValidationReason } from './rules';
import { ApiError } from '@lib/api/error-envelope';
import { z } from 'zod';
import {
  codePointLength,
  DEFAULT_ISSUE_TYPE,
  DESTINATION_KEY_PATTERN,
  ISSUE_TYPE_MAX,
  normalizeDestinationKey,
  TRACKER_SETTINGS_MESSAGES,
} from './rules';

// BK-371 — request-body validation for the Jira defect-sync settings (PUT) and
// the connection check (POST .../check). The rules and the frozen copy live in
// `./rules` (dependency-free, shared with the screen) so the three layers
// (screen, route, `bunkai_upsert_project_tracker_settings` + the table CHECK)
// cannot drift; this module adds the Zod schemas and the 422 mapping.

export {
  codePointLength,
  DEFAULT_ISSUE_TYPE,
  DESTINATION_KEY_PATTERN,
  ISSUE_TYPE_MAX,
  normalizeDestinationKey,
  TRACKER_SETTINGS_MESSAGES,
};
export type { TrackerSettingsValidationReason };

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
