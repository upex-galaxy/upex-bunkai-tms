// OpenAPI registration for `POST /api/v1/auth/magic-link`. See sibling
// `route.ts` for the handler. Schemas here mirror the Zod definition the
// handler parses; keep them in sync when the request body changes.

import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

export const MagicLinkBodySchema = z
  .object({
    email: z.string().email().max(254).openapi({ example: 'tester@bunkai.io' }),
    next: z
      .string()
      .min(1)
      .refine(value => value.startsWith('/') && !value.startsWith('//'), {
        message: 'next must be a root-relative path (e.g. /projects).',
      })
      .optional()
      .openapi({
        description: 'Root-relative path to land on after the OTP exchange. Defaults to `/projects`.',
        example: '/projects',
      }),
  })
  .openapi('MagicLinkBody');

const MagicLinkResponseSchema = z
  .object({ ok: z.literal(true) })
  .openapi('MagicLinkResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/magic-link',
  tags: ['Auth'],
  summary: 'Send a Supabase magic-link email',
  description:
    'Server-side wrapper around `supabase.auth.signInWithOtp`. Sends a one-time link to the supplied email. Public — no auth required.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: MagicLinkBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Magic-link email enqueued.',
      content: { 'application/json': { schema: MagicLinkResponseSchema } },
    },
    422: {
      description: 'Request body failed validation.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    429: {
      description: 'Supabase OTP rate limit hit (free tier: 4/hour/email).',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    502: {
      description: 'Upstream Supabase error.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});
