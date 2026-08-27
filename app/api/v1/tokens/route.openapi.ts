// OpenAPI registrations for `POST /api/v1/tokens` (issue PAT) and
// `GET /api/v1/tokens` (list caller's tokens). See sibling `route.ts` for the
// handler. Schemas mirror the Zod definitions in the handler — keep in sync.

import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const PatScopeSchema = z
  .enum(['atc:read', 'atc:write', 'run:execute', 'workspace:admin'])
  .openapi({ description: 'PAT scope vocabulary. Mirrors `.context/SRS/api-contracts.yaml` tags.' });

const CreateTokenBodySchema = z
  .object({
    name: z.string().min(1).max(80).optional().openapi({
      description: 'Human-readable label shown in the token-management UI.',
      example: 'ci-pipeline',
    }),
    scopes: z.array(PatScopeSchema).min(1).openapi({
      description:
        'Scopes granted to this token. At least one required. Requesting `workspace:admin` makes `workspace_id` MANDATORY — omitting it returns 403 `forbidden` — and additionally requires the caller to hold the role `admin` or `owner` in that workspace; any other role returns 403. Both guards run after schema validation, so the enum accepting the value is not a grant. See ADR-0005.',
    }),
    workspace_id: z.string().uuid().optional().openapi({
      description:
        'Restrict the token to a single workspace. Omit for cross-workspace tokens (non-admin scopes only). When supplied, the caller must be an ACTIVE member of that workspace — a non-member or a non-active membership returns 403 `forbidden`.',
    }),
    expires_in_days: z.number().int().positive().max(365).optional().openapi({
      description: 'TTL in days. Omit for non-expiring tokens. Max 365.',
    }),
  })
  .openapi('CreateTokenBody');

const CreateTokenResponseSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string().openapi({
      description:
        'Raw PAT in the form `bk_pat_<prefix>.<secret>`. Shown ONCE in this response. The server only stores SHA-256(secret).',
      example: 'bk_pat_AbCdEfGhIjKl.MnOpQrStUv...',
    }),
    name: z.string().nullable(),
    scopes: z.array(PatScopeSchema),
    workspace_id: z.string().uuid().nullable(),
    expires_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    warning: z.string().openapi({
      example: 'Store this token now — it cannot be retrieved later.',
    }),
  })
  .openapi('CreateTokenResponse');

const TokenSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().nullable(),
    scopes: z.array(PatScopeSchema),
    workspace_id: z.string().uuid().nullable(),
    token_prefix: z.string().openapi({
      description: 'First 12 chars of the secret. Safe to display.',
    }),
    expires_at: z.string().datetime().nullable(),
    revoked_at: z.string().datetime().nullable(),
    last_used_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi('TokenSummary');

const ListTokensResponseSchema = z
  .object({ tokens: z.array(TokenSummarySchema) })
  .openapi('ListTokensResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/tokens',
  tags: ['Tokens'],
  summary: 'Issue a personal access token',
  description:
    'Issuance is session-authenticated — a logged-in user mints PATs via the web app. PATs cannot mint other PATs (chicken-and-egg). The raw secret is returned exactly once.',
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateTokenBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Token created. Capture the `token` field — it is unrecoverable.',
      content: { 'application/json': { schema: CreateTokenResponseSchema } },
    },
    401: {
      description: 'Not signed in.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    403: {
      description:
        'Any of: a Personal Access Token was used (this route is session-only — a PAT must not mint a PAT); `workspace:admin` was requested without a `workspace_id`; the caller is not an ACTIVE member of the target workspace; or the caller is a member but not `admin`/`owner` while requesting `workspace:admin`. All four are checked after body validation. See ADR-0005.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Body failed validation.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/tokens',
  tags: ['Tokens'],
  summary: 'List the caller\'s tokens',
  description:
    'Returns every PAT the calling user owns, without the secret hash. RLS enforces ownership.',
  // `auth: 'authenticated'` in the sibling `route.ts` — read-only and
  // RLS-scoped to the caller's own tokens, so either auth method works. Unlike
  // POST /api/v1/tokens (cookie-only), a Bearer PAT MAY list tokens.
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    200: {
      description: 'Token list.',
      content: { 'application/json': { schema: ListTokensResponseSchema } },
    },
    401: {
      description: 'Not signed in.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});
