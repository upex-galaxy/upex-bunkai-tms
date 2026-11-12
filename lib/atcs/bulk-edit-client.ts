import type { BulkEditChange, BulkEditField, BulkEditItem, BulkEditReport } from '@lib/atcs/bulk-edit';
import { toWireChange } from '@lib/atcs/bulk-edit';

// BK-507 — the browser-side call behind the bulk-edit confirmation and the write.
// Modelled on `archive-client.ts`: one implementation of the request shape and
// the error contract, testable without a component.
//
// A failure is one of TWO different facts, and the UI words them differently:
//   * `rejected`: the server ANSWERED with an error envelope. A request-level
//     failure writes nothing, so "nothing changed" is true.
//   * `unknown`: no answer arrived (network drop, timeout). The write may have
//     happened, so the UI must not claim otherwise.

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export interface BulkEditRequest {
  projectId: string
  items: BulkEditItem[]
  change: BulkEditChange
}

export type BulkEditCallResult
  = | { ok: true, report: BulkEditReport }
    | { ok: false, kind: 'rejected', status: number, forbidden: boolean, message: string }
    | { ok: false, kind: 'unknown' };

const FIELDS: readonly BulkEditField[] = ['tags', 'module', 'layer', 'priority'];

function isReport(value: unknown): value is BulkEditReport {
  if (value === null || typeof value !== 'object') { return false; }
  const v = value as Record<string, unknown>;
  return typeof v.requested === 'number'
    && typeof v.changed === 'number'
    && typeof v.unchanged === 'number'
    && typeof v.refused === 'number'
    && typeof v.field === 'string'
    && FIELDS.includes(v.field as BulkEditField)
    && Array.isArray(v.outcomes);
}

export async function runBulkEdit(request: BulkEditRequest, options: { dryRun: boolean }): Promise<BulkEditCallResult> {
  let response: Response;
  try {
    response = await fetch('/api/v1/atcs/bulk-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: request.projectId,
        field: request.change.field,
        change: toWireChange(request.change),
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
      forbidden: response.status === 403,
      message: body.error?.message ?? 'The server did not say why.',
    };
  }

  const body = await response.json().catch(() => null);
  // A 2xx we cannot read is a result we cannot vouch for.
  if (!isReport(body)) { return { ok: false, kind: 'unknown' }; }
  return { ok: true, report: body };
}
