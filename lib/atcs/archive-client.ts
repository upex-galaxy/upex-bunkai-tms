// BK-571 — the browser-side calls behind the archive confirmation. Modelled on
// `duplicate-client.ts`: one implementation of the request shape and the error
// contract, shared by every entry point and testable without a component.

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export interface AtcUsageTest {
  test_id: string
  title: string
}

export type FetchAtcUsageResult
  = | { ok: true, count: number, tests: AtcUsageTest[] }
    | { ok: false };

export type ArchiveAtcResult
  = | { ok: true }
    | { ok: false, forbidden: boolean, errorMessage: string };

// The report the confirmation warns from. A failure is its own result: the
// dialog must not archive without knowing real usage.
export async function fetchAtcUsage(atcId: string): Promise<FetchAtcUsageResult> {
  try {
    const response = await fetch(`/api/v1/atcs/${atcId}/usage`);
    if (!response.ok) { return { ok: false }; }
    const body = (await response.json().catch(() => null)) as { count?: unknown, used_in?: unknown } | null;
    if (!body || typeof body.count !== 'number' || !Array.isArray(body.used_in)) { return { ok: false }; }
    return { ok: true, count: body.count, tests: body.used_in as AtcUsageTest[] };
  }
  catch {
    return { ok: false };
  }
}

export async function archiveAtc(atcId: string): Promise<ArchiveAtcResult> {
  try {
    const response = await fetch(`/api/v1/atcs/${atcId}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      return {
        ok: false,
        forbidden: response.status === 403,
        errorMessage: body.error?.message ?? 'The server did not say why.',
      };
    }
    return { ok: true };
  }
  catch {
    return { ok: false, forbidden: false, errorMessage: 'Network error.' };
  }
}
