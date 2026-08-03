import { afterEach, describe, expect, it, mock } from 'bun:test';
import { duplicateAtc } from './duplicate-client';

// BK-185 — "ATC Library: Duplicate: No UI Duplicate action — feature has no UI
// entry point on staging". Root cause: POST /api/v1/atcs/{id}/duplicate (BK-23)
// was fully implemented and working, but no UI component ever called it — the
// explorer's context menu wired a real handler, but the ATC detail view (the
// screen a user is actually looking at when they want to copy the ATC they
// opened) had none.
//
// This repo has no component/DOM render harness (no @testing-library/react,
// no jsdom/happy-dom preload — confirmed by grep across the tree), so a literal
// "render <AtcEditor>, click the button" test isn't available without adding
// new global test infra, which is out of scope for this fix. Instead this
// exercises the REAL exported `duplicateAtc` function — the exact function
// BOTH UI entry points' onClick handlers call (see
// `app/(app)/projects/[projectSlug]/project-explorer.tsx`'s handleDuplicateAtc
// and `components/atcs/AtcEditor.tsx`'s handleDuplicate) — mocking only the
// network boundary (`fetch`), never the function's own logic. The server-side
// contract itself (the RPC + route) already has real coverage in
// `duplicate-rpc.test.ts` / `duplicate-validation.test.ts`.

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchOnce(response: { ok: boolean, status: number, json: () => Promise<unknown> }) {
  const fetchMock = mock(async (_url: string, _init?: RequestInit) => response as Response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('duplicateAtc (BK-185 — the client call every "Duplicate" UI entry point invokes)', () => {
  it('POSTs to the exact duplicate endpoint for the given source ATC id, with an empty JSON body', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 201,
      json: async () => ({ atc: { id: 'new-atc-id' } }),
    });

    await duplicateAtc('source-atc-id');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/atcs/source-atc-id/duplicate');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('returns ok:true with the new ATC id on a 201, the id the caller redirects to', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: async () => ({ atc: { id: 'new-atc-id' } }),
    });

    const result = await duplicateAtc('source-atc-id');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.atcId).toBe('new-atc-id');
    }
  });

  it('returns ok:false with the server error message on a non-2xx response (e.g. forbidden)', async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'You must be a member of this workspace with write access.' } }),
    });

    const result = await duplicateAtc('source-atc-id');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toBe('You must be a member of this workspace with write access.');
    }
  });

  it('falls back to a generic message when the error response has no message body', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await duplicateAtc('source-atc-id');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toBe('Could not duplicate the ATC.');
    }
  });

  it('returns ok:false on a network failure rather than throwing — the UI must be able to show a toast, not crash', async () => {
    globalThis.fetch = mock((_url: string, _init?: RequestInit) => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const result = await duplicateAtc('source-atc-id');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toBe('Network error while duplicating the ATC.');
    }
  });
});
