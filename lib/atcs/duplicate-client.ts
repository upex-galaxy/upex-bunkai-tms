// BK-23/BK-185 — the browser-side call to POST /api/v1/atcs/{id}/duplicate,
// shared by every UI entry point that offers a "Duplicate" action (the
// explorer's right-click context menu, and the ATC detail view's toolbar).
// One implementation keeps the request shape and error/redirect contract
// consistent across entry points — BK-185 was exactly a case where the
// backend contract existed but no UI wired up to it, so this is deliberately
// factored out where it can be exercised directly by a test, independent of
// which component renders the trigger.

export type DuplicateAtcResult
  = | { ok: true, atcId: string | undefined }
    | { ok: false, errorMessage: string };

export async function duplicateAtc(sourceAtcId: string): Promise<DuplicateAtcResult> {
  try {
    const response = await fetch(`/api/v1/atcs/${sourceAtcId}/duplicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, errorMessage: body.error?.message ?? 'Could not duplicate the ATC.' };
    }
    const body = (await response.json().catch(() => ({}))) as { atc?: { id?: string } };
    return { ok: true, atcId: body.atc?.id };
  }
  catch {
    return { ok: false, errorMessage: 'Network error while duplicating the ATC.' };
  }
}
