import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const SendDigestResponseSchema = z
  .object({
    eligible_users: z.number().int().openapi({ description: 'Distinct recipients with at least one eligible unread notification.' }),
    sent: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int().openapi({ description: 'Already claimed for today (same-day re-invocation) — not a failure.' }),
  })
  .openapi('SendDigestResponse');

const responses = {
  200: { description: 'Digest run completed (per-recipient outcomes; a partial failure does not fail the whole request).', content: { 'application/json': { schema: SendDigestResponseSchema } } },
  401: { description: 'Missing or invalid CRON_SECRET.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  500: { description: 'Failed to load digest candidates.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
};

// BK-882 — GET and POST are documented separately because they are two
// different callers, not a convenience alias. GET is what Vercel Cron
// actually sends; POST is the manual retry. Both run the identical handler
// and are gated by the same CRON_SECRET bearer check.
registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/send-digest',
  tags: ['Admin'],
  summary: 'Send the daily unread-notifications email digest (cron entry point)',
  description:
    'Internal — system/cron principal only (ADR-0017), not part of the public consumer surface. This is the verb Vercel Cron invokes on the 08:00 UTC schedule declared in `vercel.json`. Requires `Authorization: Bearer <CRON_SECRET>`, which Vercel attaches automatically when the project defines that variable.',
  security: [{ cronAuth: [] }],
  responses,
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/send-digest',
  tags: ['Admin'],
  summary: 'Send the daily unread-notifications email digest (manual retry)',
  description:
    'Internal — system/cron principal only (ADR-0017), not part of the public consumer surface. Same handler as the GET cron entry point, kept for manual same-day retries and for exercising the digest on staging, where no cron runs (Vercel registers cron definitions solely from the production deployment). Requires `Authorization: Bearer <CRON_SECRET>`.',
  security: [{ cronAuth: [] }],
  responses,
});
