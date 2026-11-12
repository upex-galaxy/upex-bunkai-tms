import { BULK_EDIT_CEILING, BULK_TAG_MAX_LENGTH, BULK_TAG_OPS } from '@lib/atcs/bulk-edit';
import { ATC_LAYERS, ATC_PRIORITIES, MAX_ATC_TAGS } from '@lib/atcs/validation';
import { z } from 'zod';

// BK-507 — POST /api/v1/atcs/bulk-edit. One field per request, never mixed
// (ADR-0027). The schema is the first gate; `bunkai_bulk_edit_atcs` re-validates
// every rule, because the RPC is the authority and a caller may not come through
// this route.
//
// `status` is deliberately not a field: it is an Execution Status set by Runs.

const BulkEditItemSchema = z.object({
  id: z.string().uuid(),
  // The version the caller saw; null/absent skips the stale check for that ATC.
  version: z.number().int().min(1).nullable().optional().default(null),
});

const base = {
  project_id: z.string().uuid(),
  items: z.array(BulkEditItemSchema).min(1).max(BULK_EDIT_CEILING),
  // True previews: same evaluation, no write, no event.
  dry_run: z.boolean().optional().default(false),
};

export const AtcBulkEditBodySchema = z.discriminatedUnion('field', [
  z.object({
    ...base,
    field: z.literal('tags'),
    change: z.object({
      op: z.enum(BULK_TAG_OPS),
      tags: z.array(z.string().trim().min(1).max(BULK_TAG_MAX_LENGTH)).min(1).max(MAX_ATC_TAGS),
    }),
  }),
  z.object({
    ...base,
    field: z.literal('module'),
    change: z.object({ module_id: z.string().uuid() }),
  }),
  z.object({
    ...base,
    field: z.literal('layer'),
    change: z.object({ layer: z.enum(ATC_LAYERS) }),
  }),
  z.object({
    ...base,
    field: z.literal('priority'),
    // null clears the priority ("not specified"); the key itself is required.
    change: z.object({ priority: z.enum(ATC_PRIORITIES).nullable() }),
  }),
]);

export type AtcBulkEditBody = z.infer<typeof AtcBulkEditBodySchema>;
