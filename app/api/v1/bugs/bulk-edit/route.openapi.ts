import { BUG_BULK_CEILING, BUG_BULK_FIELDS, BUG_BULK_REFUSAL_REASONS } from '@lib/bugs/bulk-edit';
import { BugBulkEditBodySchema } from '@lib/bugs/bulk-edit-validation';
import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const RequestSchema = BugBulkEditBodySchema.openapi('BugBulkEditRequest');

const OutcomeSchema = z
  .object({
    bug_id: z.string().uuid(),
    title: z.string().nullable().describe('`null` when `not_found`.'),
    outcome: z.enum(['changed', 'unchanged', 'refused']),
    reason: z.enum(BUG_BULK_REFUSAL_REASONS).nullable().describe('Set only when `outcome` is `refused`.'),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).nullable().describe('The Bug\'s status after the call, or the status it would have for a dry run. `null` when `not_found`.'),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).nullable().describe('The Bug\'s severity after the call, or the severity it would have for a dry run. `null` when `not_found`.'),
    version: z.number().int().nullable().describe('The Bug\'s `content_version` after the call, or the one it would have for a dry run. `null` when `not_found`.'),
  })
  .openapi('BugBulkEditOutcome');

const ReportSchema = z
  .object({
    dry_run: z.boolean(),
    field: z.enum(BUG_BULK_FIELDS),
    requested: z.number().int().describe('Distinct Bugs processed (a repeated id counts once).'),
    changed: z.number().int().describe('With `dry_run`, how many WOULD change.'),
    unchanged: z.number().int().describe('Already held the requested value: a success, no version bump, no event, no notification.'),
    refused: z.number().int(),
    outcomes: z.array(OutcomeSchema),
  })
  .openapi('BugBulkEditReport');

registry.registerPath({
  method: 'post',
  path: '/api/v1/bugs/bulk-edit',
  tags: ['Bugs'],
  summary: 'Bulk-edit status or severity on up to 200 Bugs of one Project',
  description: `Bearer \`atc:write\` (or cookie session); member role or higher. ONE field per request, \`status\` or \`severity\`, on up to ${BUG_BULK_CEILING} items of one Project; a repeated id is evaluated once with the lowest version sent. Each Bug is processed on its own: partial success is the normal shape and the report lists one outcome per distinct Bug. **Status** follows the single-Bug lifecycle (open -> in_progress -> resolved -> closed): the stage already held is \`unchanged\`, the next stage changes, a stage further ahead is refused \`status_transition_skipped\` and an earlier one \`status_transition_backward\`; \`version\` is ignored. Each changed Bug writes \`bug.status_changed\` (\`previous_status\`, \`status\`, \`assignee_user_id\`, \`bulk: true\`) and notifies its reporter and assignee exactly as a single change does. **Severity** accepts P1 to P4: an equal value is \`unchanged\` whatever version is sent; otherwise a sent \`version\` that is not the Bug's \`content_version\` refuses it \`stale_version\`, and no version skips the check. Each changed Bug bumps \`content_version\` and writes \`bug.corrected\` (\`title\`, \`changes.severity\`, \`bulk: true\`), with no notification. A Bug of another Project or workspace and an unknown id are both \`not_found\`. A failure inside one Bug's write refuses that Bug \`write_failed\` and keeps the others. \`dry_run: true\` runs the same evaluation with no lock, no write, no event and no notification; it is advisory, because a concurrent edit can still change the outcome of the real call.`,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { body: { required: true, content: { 'application/json': { schema: RequestSchema } } } },
  responses: {
    200: { description: 'Per-Bug report (possibly with refusals).', content: { 'application/json': { schema: ReportSchema } } },
    400: { description: 'Body is not valid JSON (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, a viewer of the workspace (`details.reason: insufficient_role`), or a token scoped to another workspace (`token_workspace_mismatch`). Nothing was written.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'The Project is unknown or the caller is not a member of its workspace (non-disclosing). Nothing was written.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (an id or \`project_id\` that is not a UUID, an empty or over-200 selection, a field other than status or severity, a change with both or with extra keys, a value outside the vocabulary), or \`project_read_only\` for a Project over its workspace plan\'s limit, dry run included. Nothing was written.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
