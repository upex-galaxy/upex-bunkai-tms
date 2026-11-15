// BK-1899 — the browser-side calls behind the Archive and Restore controls, one
// implementation of the request shape and the error contract shared by the list
// row and the Milestone's own screen (the `lib/atcs/archive-client.ts` shape).

export type MilestoneArchiveAction = 'archive' | 'restore';

export type MilestoneArchiveResult
  = | { ok: true, changed: boolean }
    | { ok: false, forbidden: boolean, errorMessage: string };

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export async function setMilestoneArchived(milestoneId: string, action: MilestoneArchiveAction): Promise<MilestoneArchiveResult> {
  try {
    const response = await fetch(`/api/v1/milestones/${milestoneId}/${action}`, { method: 'POST' });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      return {
        ok: false,
        forbidden: response.status === 403,
        errorMessage: body.error?.message ?? 'The server did not say why.',
      };
    }
    const body = (await response.json().catch(() => ({}))) as { milestone?: { changed?: unknown } };
    return { ok: true, changed: body.milestone?.changed === true };
  }
  catch {
    return { ok: false, forbidden: false, errorMessage: 'Network error.' };
  }
}
