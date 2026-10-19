import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const StorageCleanupResponseSchema = z
  .object({
    expired_pending: z.number().int().openapi({ description: 'Pending uploads whose window lapsed, deleted this run (their objects are queued).' }),
    deleted: z.number().int().openapi({ description: 'Queued objects removed from Storage this run.' }),
    failed: z.number().int().openapi({ description: 'Queued objects whose removal failed this run; retried by the next sweep.' }),
    purged: z.number().int().openapi({ description: 'Finished outbox rows older than 7 days, deleted.' }),
    stuck: z.number().int().openapi({ description: 'Outbox rows parked after 10 failed attempts. Anything above zero needs a human.' }),
  })
  .openapi('StorageCleanupResponse');

const responses = {
  200: { description: 'Sweep completed.', content: { 'application/json': { schema: StorageCleanupResponseSchema } } },
  401: { description: 'Missing or invalid CRON_SECRET.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  500: { description: 'The sweep could not read or update the cleanup queue.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/storage-cleanup',
  tags: ['Admin'],
  summary: 'Sweep the storage cleanup queue (cron entry point)',
  description:
    'Internal - system/cron principal only (ADR-0017), not part of the public consumer surface. The verb Vercel Cron invokes on the schedule declared in `vercel.json`. Requires `Authorization: Bearer <CRON_SECRET>`. Expires stale pending evidence uploads, deletes queued Storage objects, purges old finished queue rows (ADR-0019).',
  security: [{ cronAuth: [] }],
  responses,
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/storage-cleanup',
  tags: ['Admin'],
  summary: 'Sweep the storage cleanup queue (manual retry)',
  description:
    'Internal - system/cron principal only (ADR-0017). Same handler as the GET cron entry point, kept for manual same-day retries and for staging, where no cron runs. Requires `Authorization: Bearer <CRON_SECRET>`.',
  security: [{ cronAuth: [] }],
  responses,
});
