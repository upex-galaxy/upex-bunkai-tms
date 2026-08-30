import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const SendDigestResponseSchema = z
  .object({
    eligible_users: z.number().int().openapi({ description: 'Distinct recipients with at least one eligible unread notification.' }),
    sent: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int().openapi({ description: 'Already claimed for today (same-day re-invocation) — not a failure.' }),
  })
  .openapi('SendDigestResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/send-digest',
  tags: ['Admin'],
  summary: 'Send the daily unread-notifications email digest',
  description:
    'Internal — system/cron principal only (ADR-0017), not part of the public consumer surface. Triggered by Vercel Cron at 08:00 UTC daily; may also be invoked manually as a same-day retry. Requires `Authorization: Bearer <CRON_SECRET>`.',
  security: [{ cronAuth: [] }],
  responses: {
    200: { description: 'Digest run completed (per-recipient outcomes; a partial failure does not fail the whole request).', content: { 'application/json': { schema: SendDigestResponseSchema } } },
    401: { description: 'Missing or invalid CRON_SECRET.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'Failed to load digest candidates.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
