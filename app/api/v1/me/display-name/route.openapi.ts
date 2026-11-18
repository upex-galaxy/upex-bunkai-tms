import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-1949 — the caller's own display name. Session-only (`auth: 'cookie-only'`
// in the sibling `route.ts`): a Bearer PAT is refused by the gateway with 403
// before the body runs, so `bearerAuth` is deliberately NOT offered.

const BodySchema = z
  .object({
    display_name: z
      .string()
      .openapi({
        description: 'The name to save. Outer whitespace and zero-width characters are trimmed first; the result must be 1 to 80 code points with no line breaks, tabs or bidi control characters. Other body fields are ignored.',
        example: 'Elena Vargas',
      }),
  })
  .openapi('DisplayNameBody');

const ResponseSchema = z
  .object({
    display_name: z.string().nullable().openapi({
      description: 'The stored own display name after the call, or null when none is saved.',
      example: 'Elena Vargas',
    }),
  })
  .openapi('DisplayNameResponse');

const unauthorized = {
  description: 'Caller is not signed in (`unauthorized`, "Authentication required.").',
  content: { 'application/json': { schema: ErrorEnvelopeSchema } },
};

const forbidden = {
  description: 'Caller used a Personal Access Token (`forbidden`, "Personal access tokens cannot change identity details. Use a browser session."). Refused even when a session cookie is sent too.',
  content: { 'application/json': { schema: ErrorEnvelopeSchema } },
};

registry.registerPath({
  method: 'put',
  path: '/api/v1/me/display-name',
  tags: ['Identity'],
  summary: 'Save my display name',
  description: 'Saves the signed-in person\'s own display name. It applies to the account, not to a workspace, and a later Google or GitHub sign-in never replaces it. Idempotent: saving the same value again returns the same body.',
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: BodySchema } },
    },
  },
  responses: {
    200: { description: 'Display name saved.', content: { 'application/json': { schema: ResponseSchema } } },
    400: { description: 'Body is not valid JSON (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: unauthorized,
    403: forbidden,
    422: {
      description: 'Name refused (`validation_failed`). Messages: "The display name cannot be empty." (empty or whitespace only), "The name must be at most 80 characters." (more than 80 code points), "The display name cannot contain line breaks, tabs or hidden formatting characters.", "The display name must be text." (missing or not a string). The stored name is unchanged.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/me/display-name',
  tags: ['Identity'],
  summary: 'Remove my display name',
  description: 'Removes the signed-in person\'s own display name. Greetings fall back to the sign-in provider\'s name, then to a name guessed from the email. Removing when nothing is saved returns 200 and changes nothing.',
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: 'Display name removed.', content: { 'application/json': { schema: ResponseSchema } } },
    401: unauthorized,
    403: forbidden,
  },
});
