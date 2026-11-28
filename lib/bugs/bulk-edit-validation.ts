import { BUG_BULK_CEILING } from '@lib/bugs/bulk-edit';
import { BUG_SEVERITY_VALUES, BUG_STATUS_VALUES } from '@lib/bugs/constants';
import { z } from 'zod';

// BK-2098 — POST /api/v1/bugs/bulk-edit (AI Tech Lead T5). One field per
// request; every object is strict, so a second field or an unknown key is a
// 422 rather than silently dropped. `bunkai_bulk_edit_bugs` re-validates.

const BugBulkItemSchema = z.strictObject({
  id: z.string().uuid(),
  version: z.number().int().min(1).nullable().optional().default(null),
});

const base = {
  project_id: z.string().uuid(),
  items: z.array(BugBulkItemSchema).min(1).max(BUG_BULK_CEILING),
  dry_run: z.boolean().optional().default(false),
};

export const BugBulkEditBodySchema = z.discriminatedUnion('field', [
  z.strictObject({
    ...base,
    field: z.literal('status'),
    change: z.strictObject({ status: z.enum(BUG_STATUS_VALUES) }),
  }),
  z.strictObject({
    ...base,
    field: z.literal('severity'),
    change: z.strictObject({ severity: z.enum(BUG_SEVERITY_VALUES) }),
  }),
]);

export type BugBulkEditBody = z.infer<typeof BugBulkEditBodySchema>;
