import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunSchema } from '../route.openapi';

const UploadQuerySchema = z.object({
  test_id: z.uuid().describe('The Test the report belongs to. A token only reaches Tests of its own workspace (otherwise 404).'),
  environment: z.string().min(1).max(60).describe('The NAME of one of the Test\'s Project environments (case-insensitive).'),
  file_name: z.string().max(255).optional().describe('The report\'s file name, kept on the run. Defaults to `report.xml`.'),
});

const UploadBody = {
  required: true,
  description: 'The JUnit XML report itself, 10 MB (10485760 bytes) at most once decompressed, UTF-8. Root `<testsuites>` or `<testsuite>`; every `<testcase>` is one entry, nested suites flattened in document order, at most 1000 entries, 50000 elements and 100000 attributes. A DOCTYPE or entity declaration is refused. The hosting platform refuses request bodies above 4.5 MB, so send a larger report gzip-compressed with `Content-Type: application/gzip`.',
  content: {
    'application/xml': { schema: z.string() },
    'text/xml': { schema: z.string() },
    'application/gzip': { schema: z.string().describe('The same JUnit XML report, gzip-compressed.') },
  },
};

const UploadErrors = {
  401: { description: 'Not authenticated, or the token is revoked or expired.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  403: { description: 'Missing `run:execute` scope, a viewer, or a token not bound to a workspace (`token_not_workspace_scoped`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  404: { description: 'The Test does not exist, is not visible, or belongs to another workspace than the token\'s (`not_found`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  413: { description: 'The report is larger than 10 MB, compressed or once decompressed (`file_too_large`). Nothing is read or inflated past the limit.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  415: { description: 'The Content-Type is not `application/xml`, `text/xml` or `application/gzip` (`unsupported_media_type`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
};

const ReportRejections = 'Report rejections (`validation_failed`, `details.reason`): `report_empty`, `report_not_utf8`, `report_not_gzip`, `report_dtd_forbidden`, `report_not_xml`, `report_not_junit`, `report_no_entries`, `report_too_many_entries`, `report_too_complex`; also `environment_invalid` and `no_executable_steps`.';

const CI_DETAIL_RULES = 'Optional, BK-1995 rules. Percent-encode the value (`curl --url-query`): a bare `+` arrives as a space. Sent but empty, or only spaces, is refused. An invalid value is refused with 422 `validation_failed`, `details.field` naming the field and a message that starts with the field name; nothing is recorded. Ignored by the preview.';

const UploadCreateQuerySchema = UploadQuerySchema.extend({
  acknowledge_unmapped: z.enum(['true', 'false']).optional().describe('Required as `true` when the report has more entries than the Test has chain steps; the extra entries are recorded as not mapped.'),
  idempotency_key: z.string().min(1).max(64).optional().describe('Optional domain key, same rules as POST /runs/submissions (ADR-0026): the same key with the same report, Test and environment within 24 hours returns the first run (200); anything different is 409.'),
  preview_fingerprint: z.string().length(64).optional().describe('The `fingerprint` of the preview the person confirmed. When the Test chain or the report differs, the upload is refused with 409 `preview_stale` and nothing is recorded.'),
  // eslint-disable-next-line regexp/use-ignore-case -- BK-2326: JSON Schema patterns carry no flags, so an /i-flagged regex publishes a pattern that matches nothing.
  commit: z.string().min(7).max(64).regex(/^[0-9a-fA-F]+$/).optional().describe(`BK-2097 CI context: the commit under test, hexadecimal, 7 to 64 characters, any case (stored lower-cased). ${CI_DETAIL_RULES}`),
  branch: z.string().min(1).max(255).optional().describe(`BK-2097 CI context: the branch under test, 1 to 255 characters, surrounding whitespace trimmed, line breaks and control characters refused. A pipeline running on a tag sends the tag name here (for example \`v2.4.0\`). ${CI_DETAIL_RULES}`),
  pipeline_name: z.string().min(1).max(100).optional().describe(`BK-2097 CI context: the pipeline name, 1 to 100 characters, surrounding whitespace trimmed, line breaks and control characters refused. ${CI_DETAIL_RULES}`),
  pipeline_url: z.string().max(2048).optional().describe(`BK-2097 CI context: a link to the pipeline run, http or https only, at most 2048 characters, no whitespace and no credentials (\`https://user:secret@host\` is refused). Never put credentials in this URL: a refused value is not stored, but the hosting platform's request logs keep the query string. ${CI_DETAIL_RULES}`),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/uploads',
  tags: ['Runs'],
  summary: 'Create a finished run from a CI results file',
  description: `BK-226. Signed-in session or Bearer token with scope \`run:execute\`, member role or higher; a read-only project refuses it (\`project_read_only\`). Maps the JUnit XML report onto the Test's chain by position and creates the run already finished through the same rulebook as POST /runs/submissions, with executor mode \`ci\`: \`failure\` and \`error\` fail the step, \`skipped\` and uncovered steps are blocked, the verdict is passed only when every step passed, and unmapped entries are kept on the run (\`report\`). CI context (BK-2097): \`commit\`, \`branch\`, \`pipeline_name\` and \`pipeline_url\` are optional query parameters, in any combination, with the limits and messages of POST /runs/submissions; they are stored with the run, written once, returned on every read of it, and never read from the report itself. The same \`idempotency_key\` with other details is 409 \`idempotency_key_conflict\`. The hosting platform refuses a URL above 14 KB before the app answers, which only values at their maximum made mostly of multi-byte characters can reach. Example: \`curl -X POST "$BUNKAI_URL/api/v1/runs/uploads?test_id=…&environment=Staging&acknowledge_unmapped=true" -H "Authorization: Bearer $BUNKAI_TOKEN" -H "Content-Type: application/xml" --data-binary @junit.xml\`; with CI context: \`curl -X POST "$BUNKAI_URL/api/v1/runs/uploads" --url-query "test_id=$TEST_ID" --url-query "environment=Staging" --url-query "commit=$CI_COMMIT_SHA" --url-query "branch=$CI_COMMIT_REF_NAME" --url-query "pipeline_name=$CI_PIPELINE_NAME" --url-query "pipeline_url=$CI_PIPELINE_URL" -H "Authorization: Bearer $BUNKAI_TOKEN" -H "Content-Type: application/xml" --data-binary @junit.xml\` (omit a parameter whose variable is unset). ${ReportRejections}`,
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { query: UploadCreateQuerySchema, body: UploadBody },
  responses: {
    200: { description: 'Replay: the same `idempotency_key` and report within 24 hours returned the original Run (`replayed: true`).', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    201: { description: 'Run recorded.', content: { 'application/json': { schema: z.object({ run: RunSchema }) } } },
    ...UploadErrors,
    409: { description: 'The Test is archived (`test_archived`), the preview is stale (`preview_stale`), or the `idempotency_key` was used with a different report or different CI details (`idempotency_key_conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: `Nothing is recorded. \`unmapped_not_acknowledged\` lists the entries without a matching step; \`project_read_only\` for a locked project; for a CI detail \`commit_invalid\`, \`branch_invalid\`, \`pipeline_name_invalid\` or \`pipeline_url_invalid\` with \`details.field\` (checked before the report is read, the first invalid one in that order). ${ReportRejections}`, content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
