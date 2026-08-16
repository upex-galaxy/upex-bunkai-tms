import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-229 — the Billing overview's read contract. Deliberately raw: plan key
// + live counts only. Limits, percentages, warning thresholds and display
// naming are NOT on the wire here — they are computed client-side against
// `plan` from `lib/billing/plan-tiers.ts`, the single source of truth for
// the tier ladder.

const WorkspaceBillingOverviewSchema = z
  .object({
    plan: z
      .enum(['community', 'cloud', 'enterprise'])
      .describe('The workspace\'s `workspaces.plan` literal. Look up the tier ladder (display name, seat/project/retention limits, price) for this key in `lib/billing/plan-tiers.ts` — this endpoint does not repeat it.'),
    active_seats: z
      .number()
      .int()
      .describe('Workspace members with `status = \'active\'` only. Pending invitations and suspended members never count toward this figure.'),
    project_count: z
      .number()
      .int()
      .describe('Every project in the workspace. `projects` carries no soft-delete column, so this is an exact, unfiltered count.'),
    oldest_run_age_days: z
      .number()
      .int()
      .nullable()
      .describe('Age in days of the workspace\'s oldest run (`now() - min(runs.created_at)`), or `null` when the workspace has no runs. This reports how much of the plan\'s retention WINDOW is in use — nothing in this product prunes runs, so this figure is never a countdown to deletion.'),
  })
  .describe('A workspace\'s live billing-relevant counts, admin/owner only.')
  .openapi('WorkspaceBillingOverview');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/billing',
  tags: ['Workspaces'],
  summary: 'Read a workspace\'s plan, seats, and usage overview',
  description: 'Cookie session or Bearer PAT — owner/admin only. `bunkai_workspace_billing_overview` is SECURITY INVOKER with no caller-supplied actor parameter; its own step-0 gate (`bunkai_is_workspace_admin`) restricts the read, and this route calls it through the caller\'s own RLS-scoped client, never a service-role client. A non-admin caller, an unknown workspace id, and a workspace the caller cannot see all collapse into the SAME `404 not_found` — never `403`, so the response never discloses more than the workspace\'s existence. The tier ladder (limits, price, display name) is NOT part of this payload; look it up client-side in `lib/billing/plan-tiers.ts` keyed by the returned `plan`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  responses: {
    200: { description: 'The workspace\'s billing overview.', content: { 'application/json': { schema: WorkspaceBillingOverviewSchema } } },
    400: { description: 'The workspace id in the path is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found — returned uniformly for a non-admin caller, an unknown workspace, and a workspace the caller cannot see (`not_found`, never `403`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The overview could not be read (`internal_error`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { WorkspaceBillingOverviewSchema };
