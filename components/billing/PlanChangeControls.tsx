'use client';

import type { DowngradePreview, ReadOnlyProjectRef } from '@lib/billing/subscription';
import { formatUtcDate, readApiError } from '@components/billing/billing-format';
import { Button } from '@components/ui/button';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarClock, Lock, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export const DOWNGRADE_ERROR_FALLBACK = 'Could not change the plan. Nothing was changed. Please try again.';
export const CANCEL_ERROR_FALLBACK = 'Could not cancel the subscription. Nothing was changed. Please try again.';
export const RESUBSCRIBE_ERROR_FALLBACK = 'Could not resubscribe. Nothing was changed. Please try again.';

export function blockedReasonCopy(preview: DowngradePreview): string | null {
  switch (preview.blocked_reason) {
    case 'seats_over_limit':
      return `${preview.seats.in_use} active members, Community allows ${preview.seats.limit}. Remove ${preview.seats.in_use - preview.seats.limit} member${preview.seats.in_use - preview.seats.limit === 1 ? '' : 's'} in Settings > Workspaces before downgrading.`;
    case 'cancellation_pending':
      return 'Plan changes pause while a cancellation is pending. Resubscribe first.';
    case 'checkout_open':
      return 'A checkout is in progress for this workspace. Finish or cancel it first.';
    default:
      return null;
  }
}

export function readOnlySummary(readOnly: number, inUse: number): string {
  if (readOnly === 0) {
    return `All ${inUse} project${inUse === 1 ? '' : 's'} stay editable.`;
  }
  return `${readOnly} of ${inUse} project${inUse === 1 ? '' : 's'} become read-only`;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

interface PlanChangeActionsProps {
  workspaceId: string
  currentPeriodEnd: string | null
  onChanged: () => void
}

type DialogKind = 'preview' | 'cancel' | null;

export function PlanChangeActions({ workspaceId, currentPeriodEnd, onChanged }: PlanChangeActionsProps) {
  const [open, setOpen] = useState<DialogKind>(null);
  const [preview, setPreview] = useState<DowngradePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async (): Promise<DowngradePreview | null> => {
    setLoadingPreview(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/downgrade`);
      if (!response.ok) {
        const info = await readApiError(response);
        setError(info.message ?? DOWNGRADE_ERROR_FALLBACK);
        return null;
      }
      const data = await response.json() as DowngradePreview;
      setPreview(data);
      return data;
    }
    catch {
      setError(DOWNGRADE_ERROR_FALLBACK);
      return null;
    }
    finally {
      setLoadingPreview(false);
    }
  };

  const openDialog = (kind: Exclude<DialogKind, null>) => {
    setOpen(kind);
    setPreview(null);
    void loadPreview();
  };

  const close = () => {
    if (submitting) {
      return;
    }
    setOpen(null);
    setError(null);
  };

  const confirmDowngrade = async () => {
    if (!preview) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/downgrade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': newIdempotencyKey() },
        body: JSON.stringify({
          target_plan: 'community',
          expected_read_only_project_ids: preview.projects.read_only.map(p => p.id),
        }),
      });
      if (!response.ok) {
        const info = await readApiError(response);
        if (info.code === 'downgrade_preview_stale') {
          await loadPreview();
          setError('The affected projects changed since you opened this preview. Review it again before confirming.');
          return;
        }
        setError(info.message ?? DOWNGRADE_ERROR_FALLBACK);
        return;
      }
      setOpen(null);
      onChanged();
    }
    catch {
      setError(DOWNGRADE_ERROR_FALLBACK);
    }
    finally {
      setSubmitting(false);
    }
  };

  const confirmCancel = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/subscription/cancel`, {
        method: 'POST',
        headers: { 'idempotency-key': newIdempotencyKey() },
      });
      if (!response.ok) {
        const info = await readApiError(response);
        setError(info.message ?? CANCEL_ERROR_FALLBACK);
        return;
      }
      setOpen(null);
      onChanged();
    }
    catch {
      setError(CANCEL_ERROR_FALLBACK);
    }
    finally {
      setSubmitting(false);
    }
  };

  const endsLabel = formatUtcDate(currentPeriodEnd);
  const blocked = preview ? blockedReasonCopy(preview) : null;

  return (
    <div className="flex shrink-0 flex-col items-end gap-2" data-testid="billing-plan-actions">
      <div className="flex items-center gap-2">
        <Button type="button" data-testid="billing-change-plan" onClick={() => openDialog('preview')}>
          Change plan
        </Button>
        <Button type="button" variant="ghost" data-testid="billing-cancel-subscription" onClick={() => openDialog('cancel')}>
          Cancel subscription
        </Button>
      </div>

      <Dialog.Root open={open !== null} onOpenChange={(next) => { if (!next) { close(); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content
            role="alertdialog"
            data-testid={open === 'cancel' ? 'billing-cancel-dialog' : 'billing-downgrade-dialog'}
            className="fixed left-1/2 top-1/2 z-50 flex w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-3 border border-stroke-3 bg-surface-3 p-6 shadow-pop"
          >
            <Dialog.Title className="text-md font-semibold text-fg-0">
              {open === 'cancel'
                ? `Cancel the Cloud subscription for ${preview?.workspace_name ?? 'this workspace'}?`
                : `Downgrade ${preview?.workspace_name ?? 'this workspace'} to Community?`}
            </Dialog.Title>

            {loadingPreview && !preview && (
              <p className="flex items-center gap-2 text-sm text-fg-2" data-testid="billing-preview-loading">
                <RefreshCw size={13} aria-hidden="true" className="motion-safe:animate-spin" />
                Checking what changes on Community…
              </p>
            )}

            {preview && (
              <Dialog.Description asChild>
                <div className="flex flex-col gap-3 text-sm text-fg-2">
                  {open === 'cancel'
                    ? (
                        <>
                          <p>
                            The workspace keeps full Cloud access until
                            {' '}
                            <span className="font-mono text-fg-1">{endsLabel ? `${endsLabel} UTC` : 'the end of the paid period'}</span>
                            , the end of the period already paid.
                          </p>
                          <p data-testid="billing-cancel-consequence">
                            On that date it moves to Community:
                            {' '}
                            {readOnlySummary(preview.projects.read_only.length, preview.projects.in_use)}
                            {preview.projects.read_only.length > 0 ? '.' : ''}
                          </p>
                        </>
                      )
                    : (
                        <>
                          <p>Cloud ends now, with no refund for the rest of the period. Community supports less than the workspace uses:</p>
                          <table className="w-full text-left text-[12.5px]" data-testid="billing-preview-table">
                            <thead className="text-fg-3">
                              <tr>
                                <th className="py-1 font-medium">Resource</th>
                                <th className="py-1 font-medium">In use</th>
                                <th className="py-1 font-medium">Community limit</th>
                                <th className="py-1 font-medium">After downgrade</th>
                              </tr>
                            </thead>
                            <tbody className="text-fg-1">
                              <tr className="border-t border-stroke-1">
                                <td className="py-1.5">Projects</td>
                                <td className="py-1.5 font-mono">{preview.projects.in_use}</td>
                                <td className="py-1.5 font-mono">{preview.projects.limit}</td>
                                <td className="py-1.5" data-testid="billing-preview-projects">{readOnlySummary(preview.projects.read_only.length, preview.projects.in_use)}</td>
                              </tr>
                              <tr className="border-t border-stroke-1">
                                <td className="py-1.5">Seats</td>
                                <td className="py-1.5 font-mono">{preview.seats.in_use}</td>
                                <td className="py-1.5 font-mono">{preview.seats.limit}</td>
                                <td className="py-1.5" data-testid="billing-preview-seats">
                                  {preview.seats.over_limit.length > 0 ? `${preview.seats.over_limit.length} over the cap` : 'Within the cap'}
                                </td>
                              </tr>
                              <tr className="border-t border-stroke-1">
                                <td className="py-1.5">Run history</td>
                                <td className="py-1.5 font-mono">{preview.retention.current_days === null ? 'None' : `${preview.retention.current_days} days`}</td>
                                <td className="py-1.5 font-mono">{preview.retention.target_days === null ? 'Unlimited' : `${preview.retention.target_days} days`}</td>
                                <td className="py-1.5">Older runs stay stored</td>
                              </tr>
                            </tbody>
                          </table>
                        </>
                      )}

                  {preview.projects.read_only.length > 0 && (
                    <div data-testid="billing-preview-read-only">
                      <p className="mb-1 text-[11.5px] font-medium text-fg-2">
                        Projects becoming read-only, oldest first
                        {' '}
                        <span className="font-mono">{preview.projects.read_only.length}</span>
                      </p>
                      <ul className="flex flex-col gap-1">
                        {preview.projects.read_only.map(project => (
                          <li key={project.id} className="flex items-center gap-2 text-fg-1">
                            <Lock size={11} aria-hidden="true" className="text-fg-3" />
                            {project.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {open === 'preview' && preview.seats.over_limit.length > 0 && (
                    <div data-testid="billing-preview-seat-conflict">
                      <p className="mb-1 text-[11.5px] font-medium text-fg-2">Members over the Community cap</p>
                      <ul className="flex flex-col gap-1 text-fg-1">
                        {preview.seats.over_limit.map(member => (
                          <li key={member.user_id}>{member.email ?? 'A workspace member'}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-fg-1" data-testid="billing-preview-nothing-deleted">
                    Nothing will be deleted. Read-only projects keep full view access to every test case, run, and report. Upgrade again at any time to restore editing.
                  </p>

                  {blocked && (
                    <p role="alert" className="text-signal-blocked" data-testid="billing-preview-blocked">{blocked}</p>
                  )}
                </div>
              </Dialog.Description>
            )}

            {error && (
              <p role="alert" data-testid="billing-plan-dialog-error" className="text-sm text-signal-fail">{error}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" data-testid="billing-plan-dialog-keep" disabled={submitting} onClick={close}>
                {open === 'cancel' ? 'Keep subscription' : 'Keep Cloud'}
              </Button>
              {open === 'cancel'
                ? (
                    <Button
                      type="button"
                      variant="danger"
                      data-testid="billing-cancel-confirm"
                      disabled={submitting || !preview}
                      aria-busy={submitting}
                      onClick={() => { void confirmCancel(); }}
                    >
                      {submitting && <RefreshCw size={13} aria-hidden="true" className="motion-safe:animate-spin" />}
                      {endsLabel ? `Cancel on ${endsLabel}` : 'Cancel at period end'}
                    </Button>
                  )
                : (
                    <Button
                      type="button"
                      variant="danger"
                      data-testid="billing-downgrade-confirm"
                      disabled={submitting || !preview || blocked !== null}
                      aria-busy={submitting}
                      onClick={() => { void confirmDowngrade(); }}
                    >
                      {submitting && <RefreshCw size={13} aria-hidden="true" className="motion-safe:animate-spin" />}
                      Downgrade to Community
                    </Button>
                  )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

interface PendingCancellationBannerProps {
  workspaceId: string
  endsAt: string | null
  canEdit: boolean
  onChanged: () => void
}

export function PendingCancellationBanner({ workspaceId, endsAt, canEdit, onChanged }: PendingCancellationBannerProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endsLabel = formatUtcDate(endsAt);

  const resubscribe = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/billing/subscription/resubscribe`, {
        method: 'POST',
        headers: { 'idempotency-key': newIdempotencyKey() },
      });
      if (!response.ok) {
        const info = await readApiError(response);
        setError(info.message ?? RESUBSCRIBE_ERROR_FALLBACK);
        return;
      }
      onChanged();
    }
    catch {
      setError(RESUBSCRIBE_ERROR_FALLBACK);
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="status"
      data-testid="billing-pending-cancellation"
      className="flex items-start gap-3 rounded-2 border border-stroke-2 bg-signal-blocked-bg p-3"
    >
      <CalendarClock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-signal-blocked" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-fg-0">
          Cancels on
          {' '}
          <span className="font-mono">{endsLabel ? `${endsLabel} UTC` : 'the end of the paid period'}</span>
          .
        </p>
        <p className="mt-1 text-fg-2">
          {canEdit
            ? 'The workspace keeps full Cloud access until then. The period is already paid, so resubscribing makes no new charge.'
            : 'The workspace keeps full Cloud access until then. Only the workspace owner can resubscribe.'}
        </p>
        {error && <p role="alert" data-testid="billing-resubscribe-error" className="mt-1 text-signal-fail">{error}</p>}
      </div>
      {canEdit && (
        <Button
          type="button"
          variant="primary"
          data-testid="billing-resubscribe"
          disabled={submitting}
          aria-busy={submitting}
          onClick={() => { void resubscribe(); }}
        >
          {submitting && <RefreshCw size={13} aria-hidden="true" className="motion-safe:animate-spin" />}
          Resubscribe
        </Button>
      )}
    </div>
  );
}

interface ReadOnlyProjectsListProps {
  projects: ReadOnlyProjectRef[]
  projectCount: number
}

export function ReadOnlyProjectsList({ projects, projectCount }: ReadOnlyProjectsListProps) {
  return (
    <div className="mt-4 border-t border-stroke-1 pt-3" data-testid="billing-read-only-projects">
      <p className="text-sm text-fg-1">
        <span className="font-mono">{projects.length}</span>
        {` of ${projectCount} project${projectCount === 1 ? ' is' : 's are'} read-only. Nothing was deleted.`}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {projects.map(project => (
          <li key={project.id} className="flex items-center gap-2 text-sm text-fg-2">
            <Lock size={11} aria-hidden="true" className="text-fg-3" />
            <span className="text-fg-1">{project.name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-fg-3">
        Read-only projects keep every test case, run, and report fully viewable. Upgrade the plan to edit them again.
        {' '}
        <Link href="/settings/billing/upgrade" className="text-fg-1 underline underline-offset-2 hover:text-accent">Compare plans</Link>
      </p>
    </div>
  );
}
