import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { NextResponse } from 'next/server';

// Discovery handler for `/api/v1`. Returns the API version banner plus pointers
// to the spec and Scalar docs so CLI clients (Wave-6) and curious browsers can
// introspect without guessing paths. `OPTIONS` is implemented inline for CORS
// preflight so future cross-origin clients (e.g. the bunkai CLI hitting a
// staging host) get a clean response without bouncing through middleware.

export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async () => {
  return jsonResponse({
    version: 'v1',
    openapi: '/api/openapi',
    docs: '/api/docs',
    status: 'live',
  });
});

export function OPTIONS(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'allow': 'GET, OPTIONS',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-request-id',
      'access-control-max-age': '600',
    },
  });
}
