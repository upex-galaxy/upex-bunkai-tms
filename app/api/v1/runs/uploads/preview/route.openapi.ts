import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const UploadQuerySchema = z.object({
  test_id: z.uuid().describe('The Test the report belongs to. A token only reaches Tests of its own workspace (otherwise 404).'),
  environment: z.string().min(1).max(60).describe('The NAME of one of the Test\'s Project environments (case-insensitive).'),
  file_name: z.string().max(255).optional().describe('The report\'s file name, kept on the run. Defaults to `report.xml`.'),
});

const UploadBody = {
  required: true,
  description: 'The JUnit XML report itself, 10 MB (10485760 bytes) at most, UTF-8. Root `<testsuites>` or `<testsuite>`; every `<testcase>` is one entry, nested suites flattened in document order, at most 1000 entries. A DOCTYPE or entity declaration is refused.',
  content: {
    'application/xml': { schema: z.string() },
    'text/xml': { schema: z.string() },
  },
};

const UploadErrors = {
  401: { description: 'Not authenticated, or the token is revoked or expired.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  403: { description: 'Missing `run:execute` scope, a viewer, or a token not bound to a workspace (`token_not_workspace_scoped`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  404: { description: 'The Test does not exist, is not visible, or belongs to another workspace than the token\'s (`not_found`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  413: { description: 'The body is larger than 10 MB (`file_too_large`). Nothing is read past the limit.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  415: { description: 'The Content-Type is not `application/xml` or `text/xml` (`unsupported_media_type`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
};

const ReportRejections = 'Report rejections (`validation_failed`, `details.reason`): `report_empty`, `report_not_utf8`, `report_dtd_forbidden`, `report_not_xml`, `report_not_junit`, `report_no_entries`, `report_too_many_entries`; also `environment_invalid` and `no_executable_steps`.';

const PreviewEntrySchema = z
  .object({
    index: z.number().int().describe('Position of the entry in the report, 1-based.'),
    name: z.string(),
    classname: z.string(),
    result: z.enum(['pass', 'fail', 'block']).describe('`failure` and `error` are fail, `skipped` is block, anything else is pass.'),
    outcome: z.enum(['passed', 'failed', 'errored', 'skipped']),
    message: z.string().nullable().describe('The failure, error or skip message, at most 2000 characters; stored as the note of the first step of its chain step.'),
  })
  .openapi('RunUploadPreviewEntry');

const PreviewSchema = z
  .object({
    test: z.object({ id: z.uuid(), title: z.string() }),
    environment: z.string(),
    file_name: z.string(),
    entry_count: z.number().int(),
    step_count: z.number().int().describe('The chain length of the Test.'),
    mapped: z.array(z.object({ position: z.number().int(), step_title: z.string(), entry: PreviewEntrySchema })).describe('Entry i on chain step i, for every step an entry reached.'),
    gaps: z.array(z.object({ position: z.number().int(), step_title: z.string() })).describe('Chain steps no entry reached; recorded as blocked.'),
    unmapped: z.array(PreviewEntrySchema).describe('Entries beyond the chain length; kept on the run, linked to no step.'),
    verdict: z.enum(['passed', 'failed']).describe('passed only when every chain step passed.'),
    totals: z.object({ passed: z.number().int(), failed: z.number().int(), skipped: z.number().int(), gaps: z.number().int(), unmapped: z.number().int() }),
    duration_seconds: z.number().int(),
    requires_acknowledgement: z.boolean().describe('true when there are unmapped entries: the upload then needs `acknowledge_unmapped=true`.'),
    fingerprint: z.string().describe('Pass it as `preview_fingerprint` to the upload so it refuses to record anything else than this preview.'),
  })
  .openapi('RunUploadPreview');

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/uploads/preview',
  tags: ['Runs'],
  summary: 'Preview how a CI results file maps onto a Test',
  description: `BK-226. Reads a JUnit XML report and returns the mapping by position (entry i to chain step i) without writing anything. Signed-in session or Bearer token with scope \`run:execute\`. ${ReportRejections}`,
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: { query: UploadQuerySchema, body: UploadBody },
  responses: {
    200: { description: 'The mapping preview.', content: { 'application/json': { schema: z.object({ preview: PreviewSchema }) } } },
    ...UploadErrors,
    409: { description: 'The Test is archived (`details.reason: test_archived`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: `Nothing to preview. ${ReportRejections}`, content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
