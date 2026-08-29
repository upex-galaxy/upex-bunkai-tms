import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

// BK-638 defect 1 — the cancel route can answer 409, but its OpenAPI spec
// declared only 204/401/403.
//
// `bun run openapi:diff` cannot catch this: it compares `public/openapi.json`
// against the very `*.openapi.ts` files that generated it, so a response the
// HANDLER produces but the SPEC never registered is identical on both sides
// of that diff. The gap is only visible by comparing the spec against the
// handler's actual throws — which is what this file does, by hand, for the
// one route the ticket names.
//
// Asserting on the GENERATED `public/openapi.json` rather than on the
// registry is deliberate: that file is the artifact a generated client or a
// contract test consumes, so a `.openapi.ts` edit that was never followed by
// `bun run openapi:gen` must fail here too.

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..', '..', '..', '..', '..');
const CANCEL_PATH = '/api/v1/workspaces/{id}/billing/checkout/cancel';

interface OpenApiDoc {
  paths: Record<string, { post?: { responses?: Record<string, { description?: string }> } }>
}

function cancelResponses(specRelPath: string): Record<string, { description?: string }> {
  const doc = JSON.parse(readFileSync(join(REPO_ROOT, specRelPath), 'utf8')) as OpenApiDoc;
  const responses = doc.paths[CANCEL_PATH]?.post?.responses;
  if (!responses) {
    throw new Error(`${specRelPath} does not register POST ${CANCEL_PATH} at all`);
  }
  return responses;
}

describe('POST /workspaces/{id}/billing/checkout/cancel — OpenAPI response coverage (BK-638 defect 1)', () => {
  it('declares the 409 the already-paid branch of cancelBillingCheckout throws', () => {
    // lib/billing/checkout.ts's already-complete branch throws
    // `checkout_in_progress` (409 per lib/api/error-envelope.ts's
    // DEFAULT_STATUS) with `details.reason: 'checkout_already_completed'`.
    // Undeclared, a generated client treats it as an unmodelled response.
    const responses = cancelResponses('public/openapi.json');
    expect(Object.keys(responses)).toContain('409');
    expect(responses['409']?.description).toContain('checkout_in_progress');
  });

  it('declares the 400 the route throws on a malformed workspace id', () => {
    // route.ts rejects a non-UUID `{id}` with `bad_request` BEFORE auth
    // resolution — the same outcome the sibling begin-checkout spec declares.
    expect(Object.keys(cancelResponses('public/openapi.json'))).toContain('400');
  });

  it('declares the 503 an unconfigured payment processor produces', () => {
    // `getStripeClient()` throws `payment_processor_unavailable` (503) when
    // STRIPE_SECRET_KEY is absent, and the cancel path calls it.
    expect(Object.keys(cancelResponses('public/openapi.json'))).toContain('503');
  });

  it('keeps the pre-existing 204/401/403 declarations', () => {
    const codes = Object.keys(cancelResponses('public/openapi.json'));
    expect(codes).toContain('204');
    expect(codes).toContain('401');
    expect(codes).toContain('403');
  });

  it('the committed api/openapi.json copy carries the same response set', () => {
    // Two copies of the same document are committed (`public/` is served,
    // `api/` feeds `bun run api:sync`'s type generation). A regeneration that
    // updated only one of them is drift, not a fix.
    expect(Object.keys(cancelResponses('api/openapi.json')).sort())
      .toEqual(Object.keys(cancelResponses('public/openapi.json')).sort());
  });
});
