// BK-596 — the browser-side calls behind the Test header's rename, archive and
// restore. Modelled on `lib/atcs/archive-client.ts`: one implementation of the
// request shape and the error contract, testable without a component.

import { TEST_TITLE_MAX } from '@lib/tests/validation';

interface ApiErrorBody {
  error?: { code?: string, message?: string, details?: { reason?: string } }
}

export type TestWriteResult
  = | { ok: true, changed: boolean }
    | { ok: false, forbidden: boolean, errorMessage: string };

// One human message per named refusal; anything else keeps the server's words.
export function testWriteErrorMessage(status: number, body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'title_required':
      return 'A Test needs a name.';
    case 'title_too_long':
    case 'title_invalid':
      return `Keep the name to ${TEST_TITLE_MAX} characters or fewer.`;
    case 'version_conflict':
      return 'Someone else changed this Test. Reload to see the latest version.';
    case 'test_archived':
      return 'This Test is archived. Restore it before changing it.';
  }
  if (status === 403) {
    return 'You do not have permission to change Tests in this workspace.';
  }
  if (status === 404) {
    return 'This Test is no longer available.';
  }
  return body.error?.message ?? 'The server did not say why.';
}

async function send(path: string, init: RequestInit): Promise<{ response: Response, body: unknown }> {
  const response = await fetch(path, init);
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  return { response, body };
}

function failure(response: Response, body: unknown): TestWriteResult {
  return {
    ok: false,
    forbidden: response.status === 403,
    errorMessage: testWriteErrorMessage(response.status, (body ?? {}) as ApiErrorBody),
  };
}

export async function renameTest(testId: string, title: string, version: number): Promise<TestWriteResult> {
  try {
    const { response, body } = await send(`/api/v1/tests/${testId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-if-match': String(version) },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) { return failure(response, body); }
    return { ok: true, changed: Boolean((body as { changed?: unknown }).changed) };
  }
  catch {
    return { ok: false, forbidden: false, errorMessage: 'Network error.' };
  }
}

export async function archiveTest(testId: string): Promise<TestWriteResult> {
  try {
    const { response, body } = await send(`/api/v1/tests/${testId}`, { method: 'DELETE' });
    if (!response.ok) { return failure(response, body); }
    return { ok: true, changed: true };
  }
  catch {
    return { ok: false, forbidden: false, errorMessage: 'Network error.' };
  }
}

export async function restoreTest(testId: string): Promise<TestWriteResult> {
  try {
    const { response, body } = await send(`/api/v1/tests/${testId}/restore`, { method: 'POST' });
    if (!response.ok) { return failure(response, body); }
    return { ok: true, changed: Boolean((body as { test?: { changed?: unknown } }).test?.changed) };
  }
  catch {
    return { ok: false, forbidden: false, errorMessage: 'Network error.' };
  }
}
