import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-371 — Jira defect-sync settings of a Project: read (any member or viewer)
// and write (owner / admin only). The write is check-on-save when the sync is ON
// and needs `confirm_queue_count` when it would queue defects (PO Q1). No defect
// is sent to Jira by these routes.

const TrackerSettingsSchema = z
  .object({
    destination_project_key: z.string().nullable().describe('Jira project key, 2-10 characters, ^[A-Z][A-Z0-9_]{1,9}$. Null when the Project was never configured.'),
    issue_type_name: z.string().describe('Jira issue type name, 1-60 characters. "Bug" until configured.'),
    enabled: z.boolean().describe('Whether the Project\'s defects are synced to Jira.'),
    configured: z.boolean().describe('False when no settings row exists yet (defaults are returned).'),
    updated_at: z.string().datetime().nullable(),
  })
  .openapi('ProjectTrackerSettings');

const GetResponseSchema = z
  .object({ tracker_settings: TrackerSettingsSchema })
  .openapi('ProjectTrackerSettingsResponse');

const PutBodySchema = z
  .object({
    destination_project_key: z.string().describe('Trimmed and upper-cased (ASCII) by the server before validation. Required, even with the sync off.'),
    issue_type_name: z.string().optional().describe('Trimmed, 1-60 characters. Defaults to "Bug". With the sync ON the stored value is Jira\'s own spelling.'),
    enabled: z.boolean(),
    confirm_queue_count: z.number().int().min(0).optional().describe('The number of defects the user saw in the confirmation dialog. Required (and must equal the number the save would queue) when that number is above 0.'),
  })
  .openapi('ProjectTrackerSettingsPutBody');

const PutResponseSchema = z
  .object({
    tracker_settings: TrackerSettingsSchema,
    requeued: z.number().int().min(0).describe('Defects queued by this save (0 when none).'),
  })
  .openapi('ProjectTrackerSettingsPutResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/tracker-settings',
  tags: ['Tracker settings'],
  summary: 'Read a Project\'s Jira defect-sync settings',
  description:
    'Any workspace member or viewer. A Project that was never configured answers sync off, no destination key and issue type "Bug". A Project the caller cannot see answers the same 404 as a missing one.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Settings (or the defaults).', content: { 'application/json': { schema: GetResponseSchema } } },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found, or not visible to the caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/projects/{id}/tracker-settings',
  tags: ['Tracker settings'],
  summary: 'Save a Project\'s Jira defect-sync settings',
  description:
    'Owner or admin only (scope `workspace:admin` plus a live role check). With `enabled: true` the connection check runs first and nothing is saved when it fails (422, `details.reason` `connection_check_failed`). Switching on, or changing the key or issue type while on, queues the Project\'s unsent defects; when that number is above 0 the call answers 409 (`details.reason` `queue_confirmation_required`, `details.queue_count` N) until `confirm_queue_count` equals N. A save that changes nothing writes and queues nothing. Last write wins. The check-on-save counts as the person\'s one running check: an overlapping check or save answers 429.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: { required: true, content: { 'application/json': { schema: PutBodySchema } } },
  },
  responses: {
    200: { description: 'Saved; the stored values and the number of defects queued.', content: { 'application/json': { schema: PutResponseSchema } } },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing workspace:admin scope, a token scoped to another workspace, or the caller is not an owner or admin (`details.reason` `admin_required`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found, or not visible to the caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The save would queue defects and the confirmation is missing or stale (`queue_confirmation_required`, `queue_count_mismatch`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed. `details.reason` is `invalid_destination_key`, `destination_required`, `invalid_issue_type` or `connection_check_failed` (with `details.check` `{ kind, message }`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'Only with `enabled: true`: a connection check by the same person is already running (`details.reason` `check_in_progress`). Nothing was saved.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { TrackerSettingsSchema };
