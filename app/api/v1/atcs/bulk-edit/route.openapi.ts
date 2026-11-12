import { BULK_EDIT_CEILING, BULK_REFUSAL_REASONS } from '@lib/atcs/bulk-edit';
import { AtcBulkEditBodySchema } from '@lib/atcs/bulk-edit-validation';
import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-507 — the bulk-edit contract (ADR-0027). The request schema is the route's
// own, so the documented body cannot drift from the validated one.
const RequestSchema = AtcBulkEditBodySchema.openapi('AtcBulkEditRequest');

const OutcomeSchema = z
  .object({
    atc_id: z.string().uuid(),
    slug: z.string().nullable().describe('The ATC\'s ID after the call. A Module move regenerates the module segment and keeps the suffix.'),
    title: z.string().nullable(),
    outcome: z.enum(['changed', 'unchanged', 'refused']),
    reason: z.enum(BULK_REFUSAL_REASONS).nullable().describe('Set only when `outcome` is `refused`.'),
    version: z.number().int().nullable().describe('The ATC\'s version after the call (unchanged when it was not written).'),
  })
  .openapi('AtcBulkEditOutcome');

const ReportSchema = z
  .object({
    dry_run: z.boolean(),
    field: z.enum(['tags', 'module', 'layer', 'priority']),
    requested: z.number().int().describe('Distinct ATCs processed (a repeated id counts once).'),
    changed: z.number().int().describe('With `dry_run`, how many WOULD change.'),
    unchanged: z.number().int().describe('Already held the target value: a success, no version bump, no event.'),
    refused: z.number().int(),
    outcomes: z.array(OutcomeSchema),
  })
  .openapi('AtcBulkEditReport');

registry.registerPath({
  method: 'post',
  path: '/api/v1/atcs/bulk-edit',
  tags: ['ATCs'],
  summary: 'Bulk-edit tags, Module, layer or priority on up to 200 ATCs',
  description: `Bearer \`atc:write\` (or cookie session). Changes ONE field on up to ${BULK_EDIT_CEILING} ATCs of one Project: \`tags\` (\`op\` \`add\` or \`remove\`, tags normalised like the editor), \`module\` (validated per ATC against its own User Story's Module subtree, inclusive; the slug's module segment is regenerated and its suffix kept), \`layer\` or \`priority\` (\`null\` clears it). \`status\` is an Execution Status set by Runs and is not editable. Each ATC is processed on its own: partial success is the normal shape, a refused ATC never rolls back the others, and the report lists one outcome per ATC. An ATC already holding the target value is \`unchanged\` (no version bump, no event), checked before the stale check, so repeating a request is safe. \`version\` per item refuses an ATC edited since the caller loaded it (\`stale_version\`) instead of overwriting it. Each changed ATC emits its own \`atc.updated\` event with the distinct chaining Test ids. \`dry_run: true\` runs the same evaluation with no write and no event.`,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { body: { required: true, content: { 'application/json': { schema: RequestSchema } } } },
  responses: {
    200: { description: 'Per-ATC report (possibly with refusals).', content: { 'application/json': { schema: ReportSchema } } },
    400: { description: 'Body is not valid JSON.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or not a writer of the Project\'s workspace (a viewer).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project or destination Module not found, archived or in another Project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed: empty selection, more than 200 ATCs, unknown field, bad value. Nothing was written.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
