import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { getTestAutomationStatus, setTestAutomationStatus } from '@lib/supabase/rpc';
import { mapTestAutomationStatusError } from '@lib/tests/errors';
import { TestAutomationStatusBodySchema } from '@lib/tests/validation';

// BK-227 — a Test's automation status and its append-only history. No method
// edits or deletes a history entry: the only write is a status change, which
// appends one.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  const { principal } = getAuth(ctx);
  const { data, error } = await getTestAutomationStatus(createAdminClient(), { actorUserId: principal.userId, testId });
  if (error) {
    mapTestAutomationStatusError(error);
  }
  return jsonResponse(data, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const PUT = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  const { principal } = getAuth(ctx);

  const raw = (await request.text()).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw === '' ? '{}' : raw);
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const body = TestAutomationStatusBodySchema.parse(parsed);

  const { data, error } = await setTestAutomationStatus(createAdminClient(), {
    actorUserId: principal.userId,
    testId,
    status: body.status,
  });
  if (error) {
    mapTestAutomationStatusError(error);
  }
  return jsonResponse(data, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

function extractTestId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const testId = segments.at(-2) ?? '';
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(testId)) {
    throw new ApiError('bad_request', 'Test id must be a UUID.');
  }
  return testId;
}
