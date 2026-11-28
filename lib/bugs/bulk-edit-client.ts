import type { BugBulkChange, BugBulkEditReport, BugBulkField, BugBulkItem } from '@lib/bugs/bulk-edit';
import { BUG_BULK_FIELDS, toBugBulkWireChange } from '@lib/bugs/bulk-edit';

// BK-2098 — the browser-side call behind the confirmation and the write, the
// shape of `lib/atcs/bulk-edit-client.ts`. `rejected` means the server answered
// with an error envelope, so nothing was written; `unknown` means no usable
// answer arrived, so the write may have happened.

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export interface BugBulkEditRequest {
  projectId: string
  items: BugBulkItem[]
  change: BugBulkChange
}

export type BugBulkEditCallResult
  = | { ok: true, report: BugBulkEditReport }
    | { ok: false, kind: 'rejected', status: number, message: string }
    | { ok: false, kind: 'unknown' };

function isReport(value: unknown): value is BugBulkEditReport {
  if (value === null || typeof value !== 'object') { return false; }
  const v = value as Record<string, unknown>;
  return typeof v.requested === 'number'
    && typeof v.changed === 'number'
    && typeof v.unchanged === 'number'
    && typeof v.refused === 'number'
    && typeof v.field === 'string'
    && (BUG_BULK_FIELDS as readonly string[]).includes(v.field)
    && Array.isArray(v.outcomes);
}

export async function runBugBulkEdit(request: BugBulkEditRequest, options: { dryRun: boolean }): Promise<BugBulkEditCallResult> {
  let response: Response;
  try {
    response = await fetch('/api/v1/bugs/bulk-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: request.projectId,
        field: request.change.field satisfies BugBulkField,
        change: toBugBulkWireChange(request.change),
        items: request.items,
        dry_run: options.dryRun,
      }),
    });
  }
  catch {
    return { ok: false, kind: 'unknown' };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    return {
      ok: false,
      kind: 'rejected',
      status: response.status,
      message: body.error?.message ?? 'The server did not say why.',
    };
  }

  const body = await response.json().catch(() => null);
  if (!isReport(body)) { return { ok: false, kind: 'unknown' }; }
  return { ok: true, report: body };
}
