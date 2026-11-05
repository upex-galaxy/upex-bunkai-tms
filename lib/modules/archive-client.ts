// BK-601 — the browser-side calls behind the explorer's archived opt-in and Restore.
// Modelled on `lib/atcs/archive-client.ts`: one implementation of the request shape
// and the error contract, testable without a component.
import type { ModuleTreeListing } from './archived-tree';

interface ApiErrorBody {
  error?: { code?: string, message?: string, details?: { reason?: string } }
}

export type FetchModuleTreeResult
  = | { ok: true, listing: ModuleTreeListing }
    | { ok: false, errorMessage: string };

export async function fetchModuleTreeWithArchived(projectId: string): Promise<FetchModuleTreeResult> {
  try {
    const response = await fetch(`/api/v1/projects/${projectId}/modules?include_archived=true`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      return { ok: false, errorMessage: body.error?.message ?? 'The server did not say why.' };
    }
    return { ok: true, listing: await response.json() as ModuleTreeListing };
  }
  catch {
    return { ok: false, errorMessage: 'Network error.' };
  }
}

export interface RestoredModule {
  id: string
  name: string
  changed: boolean
  modules: number
  user_stories: number
  acceptance_criteria: number
  atcs: number
}

export type RestoreModuleResult
  = | { ok: true, restored: RestoredModule }
    | { ok: false, errorMessage: string };

// A refusal's message already names what blocked it and what to do next, so the
// dialog shows it as it comes.
export async function restoreModule(moduleId: string): Promise<RestoreModuleResult> {
  try {
    const response = await fetch(`/api/v1/modules/${moduleId}/restore`, { method: 'POST' });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      return { ok: false, errorMessage: body.error?.message ?? 'The server did not say why.' };
    }
    const body = await response.json() as { restored: RestoredModule };
    return { ok: true, restored: body.restored };
  }
  catch {
    return { ok: false, errorMessage: 'Network error.' };
  }
}
