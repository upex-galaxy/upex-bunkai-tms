import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { TEST_BULK_CEILING, TEST_BULK_RAW_ID_LIMIT, TEST_BULK_REFUSAL_REASONS, TEST_BULK_TAG_MODES, TestBulkEditBodySchema } from '@lib/tests/bulk-edit';

// The route's own schema, so the documented body cannot drift from the validated one.
const RequestSchema = TestBulkEditBodySchema.openapi('TestBulkEditRequest');

const OutcomeSchema = z
  .object({
    test_id: z.string().uuid(),
    outcome: z.enum(['changed', 'unchanged', 'refused']),
    reason: z.enum(TEST_BULK_REFUSAL_REASONS).nullable().describe('Set only when `outcome` is `refused`.'),
    tags: z.array(z.string()).nullable().describe('The Test\'s tags after the call, or the tags it would have for a dry run. `null` when `not_found`, and when `write_failed` struck before the Test could be read.'),
    version: z.number().int().nullable().describe('The Test\'s version after the call, or the version it would have for a dry run. `null` when `tags` is.'),
  })
  .openapi('TestBulkEditOutcome');

const ReportSchema = z
  .object({
    dry_run: z.boolean(),
    mode: z.enum(TEST_BULK_TAG_MODES),
    requested: z.number().int().describe('Distinct Tests processed (a repeated id counts once).'),
    changed: z.number().int().describe('With `dry_run`, how many WOULD change.'),
    unchanged: z.number().int().describe('Already held (add) or already lacked (remove) every tag: a success, no version bump, no event.'),
    refused: z.number().int(),
    outcomes: z.array(OutcomeSchema),
  })
  .openapi('TestBulkEditReport');

registry.registerPath({
  method: 'post',
  path: '/api/v1/tests/bulk-edit',
  tags: ['Tests'],
  summary: 'Bulk add or remove tags on up to 200 Tests',
  description: `Bearer \`atc:write\` (or cookie session). Adds or removes 1 to 20 tags on up to ${TEST_BULK_CEILING} distinct Tests of one workspace (at most ${TEST_BULK_RAW_ID_LIMIT} ids including repeats). There is no whole-set replace in bulk; use \`PUT /api/v1/tests/{id}/tags\` for one Test. Tags are normalised like the single-Test edit: reserved tags (smoke, sanity, regression) are lowercased and match in any casing, custom tags keep their casing and match exact-case. Length counts characters (code points), at most 50. The workspace is \`workspace_id\` when sent, otherwise a scoped token's own workspace, otherwise the session's active workspace. Each Test is processed on its own: partial success is the normal shape and the report lists one outcome per distinct Test. A Test whose set would not change is \`unchanged\` (no version bump, no event), checked before the 20-tag cap; an add that would exceed the cap refuses that Test as a whole. Missing ids and ids of another workspace are both \`not_found\`. Each changed Test writes its own \`test.tags_changed\` event (\`version\`, \`old_tags\`, \`new_tags\`, \`bulk: true\`). \`dry_run: true\` runs the same evaluation with no lock, no write and no event; it is advisory, because a concurrent edit can still change the outcome of the real call. There is no app-level rate limiter, so the ${TEST_BULK_CEILING}-Test ceiling is the only size guard.`,
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { body: { required: true, content: { 'application/json': { schema: RequestSchema } } } },
  responses: {
    200: { description: 'Per-Test report (possibly with refusals).', content: { 'application/json': { schema: ReportSchema } } },
    400: { description: 'Body is not valid JSON, or a Test id is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, not a writer of the workspace (`details.reason: insufficient_role`), or a scoped token naming another workspace (`token_workspace_mismatch`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed: unknown key, mode other than add or remove, empty or invalid tag list, empty selection, more than 200 distinct Tests, or no workspace context. Nothing was written.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
