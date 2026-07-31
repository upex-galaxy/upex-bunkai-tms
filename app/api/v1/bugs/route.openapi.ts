import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-40 — file a TMS-native bug, either linked to a failed run step or
// standalone. The composed Bug payload mirrors bunkai_bug_json: header +
// nested module `{id, name, path}`.

const BugModuleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    path: z.string(),
  })
  .openapi('BugModule');

const BugSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    project_id: z.string().uuid(),
    module_id: z.string().uuid(),
    module: BugModuleSchema,
    run_id: z.string().uuid().nullable().describe('Provenance link to the source Run; null for a standalone bug.'),
    run_step_id: z.string().uuid().nullable().describe('Provenance link to the source run step; null for a standalone bug.'),
    atc_id: z.string().uuid().nullable().describe('Provenance link to the source ATC; null for a standalone bug.'),
    title: z.string(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).describe('BK-40 always creates `open`; the other states are the lifecycle this table already supports for later stories.'),
    description: z.string().nullable(),
    steps_to_reproduce: z.string(),
    evidence_urls: z.array(z.string().url()).max(10),
    created_by: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi('Bug');

const RunLinkedCreateBodySchema = z
  .object({
    run_step_id: z.string().uuid().describe('The failed run step this bug is filed from. project_id/module_id/run_id/atc_id are ALWAYS derived server-side from this — never accept them from the client on this path.'),
    title: z.string().min(5).max(200),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    description: z.string().optional(),
    steps_to_reproduce: z.string().optional(),
    evidence_urls: z.array(z.string().url()).max(10).optional(),
  })
  .openapi('BugRunLinkedCreateBody');

const StandaloneCreateBodySchema = z
  .object({
    project_id: z.string().uuid(),
    module_id: z.string().uuid(),
    title: z.string().min(5).max(200),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    description: z.string().optional(),
    steps_to_reproduce: z.string().optional(),
    evidence_urls: z.array(z.string().url()).max(10).optional(),
  })
  .openapi('BugStandaloneCreateBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/bugs',
  tags: ['Bugs'],
  summary: 'File a bug, linked to a failed run step or standalone',
  description: 'Bearer `atc:write` (or cookie session). Run-linked: body carries ONLY `run_step_id` — project/module/run/ATC context is derived server-side from the run (never client-supplied) and the target step must be `failed`. Standalone: body carries `project_id` + `module_id` directly. Either way `bunkai_create_bug` re-validates module ∈ project server-side. Always creates status `open`. Emits a `bug.filed` activity event.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.union([RunLinkedCreateBodySchema, StandaloneCreateBodySchema]),
        },
      },
    },
  },
  responses: {
    201: { description: 'Bug filed.', content: { 'application/json': { schema: z.object({ bug: BugSchema }) } } },
    400: { description: 'Malformed body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member with write access.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project, module, or run step not found (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (title 5–200 chars, severity P1–P4, evidence links ≤10, module outside project, or the run-linked step is not `failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { BugModuleSchema, BugSchema };
