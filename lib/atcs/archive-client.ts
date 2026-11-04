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

export type HeldByParent = 'module' | 'user_story' | null;

export type RestoreAtcResult
  = | { ok: true, title: string | null, heldByParent: HeldByParent }
    | { ok: false, errorMessage: string };

// POST .../restore answers `{ atc: { title, held_by_parent, ... } }`. When the
// ATC sits under an archived Module or User Story the server keeps it archived
// with that parent and says so in `held_by_parent`.
export async function restoreAtc(atcId: string): Promise<RestoreAtcResult> {
  try {
    const response = await fetch(`/api/v1/atcs/${atcId}/restore`, { method: 'POST' });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      return { ok: false, errorMessage: body.error?.message ?? 'The server did not say why.' };
    }
    const body = (await response.json().catch(() => ({}))) as { atc?: { title?: string, held_by_parent?: string | null } };
    const held = body.atc?.held_by_parent;
    return {
      ok: true,
      title: body.atc?.title ?? null,
      heldByParent: held === 'module' || held === 'user_story' ? held : null,
    };
  }
  catch {
    return { ok: false, errorMessage: 'Network error.' };
  }
}
