import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const BodySchema = z
  .object({
    revoke_pats: z.boolean().optional().openapi({
      description:
        'When `true`, revoke every active personal access token of the caller (not revoked and not expired, any workspace or none) and end every session of the caller on every device. When omitted or `false`, end only the calling session and leave every token untouched. Must be a JSON boolean: a string such as `"false"`, a number or `null` is 422.',
    }),
  })
  .openapi('SignOutBody');

const ResponseSchema = z
  .object({
    revoked_pats: z.number().int().nonnegative().openapi({
      description: 'How many tokens this call revoked. Always 0 when `revoke_pats` is not `true`; also 0 when there was nothing active to revoke.',
    }),
  })
  .openapi('SignOutResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/sign-out',
  tags: ['Auth'],
  summary: 'Sign out, and optionally revoke my personal access tokens',
  description:
    'Ends the calling browser session server-side. Session-only (`auth: \'cookie-only\'`): a headless caller replays the session cookie that `POST /api/v1/auth/signin` sets. The body is optional; an empty body means `{}`, and unknown fields are ignored. With `revoke_pats: true` the tokens are revoked first and the sessions are ended after; if either step fails the response is 500 and the session stays usable, so the call can be retried. A Supabase access token captured before sign-out may keep working against the Supabase REST API until it expires (up to 1 hour); Bunkai routes reject the ended session at once. No `Idempotency-Key` is needed: a repeat with the same session is 401.',
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: false,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Signed out.', content: { 'application/json': { schema: ResponseSchema } } },
    400: { description: 'The body is not valid JSON. Nothing was changed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'No valid session: missing, expired or already ended. Also returned when an `Authorization: Bearer` header carries a token that is invalid, revoked or expired, even if a valid session cookie is present.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'A valid Bearer PAT was sent. Sign-out is a session operation; a token cannot sign itself out. A Bearer header is checked before the cookie, so this applies even when a valid session cookie is also present.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'The body is not an object, or `revoke_pats` is not a boolean. Nothing was changed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The token revoke or the session end failed. The session is still valid; retry. If the tokens were already revoked, the retry reports `revoked_pats: 0`.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
