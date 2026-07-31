'use client';

import type { LeaveWorkspaceTarget } from '@components/settings/LeaveWorkspaceModal';
import type { WorkspaceRow } from '@lib/account/workspaces';
import { LeaveWorkspaceModal } from '@components/settings/LeaveWorkspaceModal';
import { Badge } from '@components/ui/badge';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { roleLabel } from '@lib/account/role-label';
import { resolveWorkspacesViewState } from '@lib/account/workspaces';
import { Lock, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface WorkspacesListProps {
  workspaces: WorkspaceRow[]
  error?: boolean
  // BK-90 Slice B (Decision 6) — opt-in, default `false`. Only
  // `settings/workspaces/page.tsx` passes `true`; `settings/account/page.tsx`
  // is untouched and keeps rendering exactly as before BK-90.
  enableLeaveAction?: boolean
}

// Settings > Account workspace list (BK-87 PR2 — TC-AC2, TC-AC6, TC-AC7).
// Client component: the error state's "Retry" button needs `router.refresh()`
// interactivity. All Supabase I/O happens in the caller's own async server
// component (`settings/account/page.tsx`'s `WorkspacesSection`) — this
// component only renders whatever it is handed (TD7: that fetch is isolated
// from IdentityCard's, so a failed query here never blanks the identity card).
export function WorkspacesList({ workspaces, error = false, enableLeaveAction = false }: WorkspacesListProps) {
  const router = useRouter();
  const state = resolveWorkspacesViewState({ error, rowCount: workspaces.length });
  const [leaveTarget, setLeaveTarget] = useState<LeaveWorkspaceTarget | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  return (
    <>
      <Card data-testid="workspaces-list" role="region" aria-labelledby="settings-workspaces-heading">
        <CardHeader className="flex-row items-center gap-3 border-b border-stroke-1 p-4">
          <h2 id="settings-workspaces-heading" className="text-sm font-semibold text-fg-0">Workspaces</h2>
          {state === 'list' && (
            <Badge variant="secondary" className="ml-auto">
              {workspaces.length}
              {' '}
              {workspaces.length === 1 ? 'workspace' : 'workspaces'}
            </Badge>
          )}
        </CardHeader>

        {state === 'error' && (
          <CardContent className="flex flex-col gap-3 p-4" data-testid="workspaces-error">
            <p className="text-sm text-fg-2">
              We couldn&apos;t load your workspaces. Your identity above loaded fine — only this section failed.
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                data-testid="workspaces-retry"
                onClick={() => router.refresh()}
              >
                <RefreshCw size={13} />
                Retry
              </Button>
            </div>
          </CardContent>
        )}

        {state === 'empty' && (
          <CardContent className="flex flex-col gap-3 p-4" data-testid="workspaces-empty">
            <p className="text-sm text-fg-2">You don&apos;t belong to any workspace yet.</p>
            <div>
              <Link
                href="/onboarding"
                data-testid="workspaces-empty-cta"
                className="inline-flex h-8 items-center gap-2 rounded-2 bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hi"
              >
                Create workspace
              </Link>
            </div>
          </CardContent>
        )}

        {state === 'list' && (
          <CardContent className="max-h-[400px] overflow-y-auto p-0" data-testid="workspaces-rows">
            {workspaces.map(ws => (
              <div
                key={ws.id}
                data-testid={`workspace-row-${ws.slug}`}
                className={enableLeaveAction && workspaces.length > 1
                  ? 'grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-4 border-b border-stroke-1 px-4 py-3 last:border-b-0'
                  : 'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-4 border-b border-stroke-1 px-4 py-3 last:border-b-0'}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-fg-0">{ws.name}</span>
                  <span className="font-mono text-xs text-fg-3">{ws.slug}</span>
                </div>
                <Badge variant="secondary">{roleLabel(ws.role)}</Badge>
                <span data-testid={`workspace-active-${ws.slug}`} className="flex w-14 items-center gap-1.5 text-xs text-fg-2">
                  {ws.isActive && (
                    <>
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-signal-pass" />
                      active
                    </>
                  )}
                </span>
                <span className="font-mono text-xs text-fg-3">
                  {ws.memberCount}
                  {' '}
                  {ws.memberCount === 1 ? 'member' : 'members'}
                </span>
                {enableLeaveAction && workspaces.length > 1 && (
                  <span className="flex flex-col items-end gap-0.5 text-right">
                    {ws.isSoleOwner
                      ? (
                          <>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-signal-blocked">
                              <Lock size={13} aria-hidden="true" />
                              Can&apos;t leave
                            </span>
                            <span className="text-2xs text-fg-3">
                              You&apos;re its only owner. Ownership transfer isn&apos;t available yet.
                            </span>
                          </>
                        )
                      : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`workspace-leave-${ws.slug}`}
                            aria-label={`Leave workspace ${ws.name} (${ws.slug})`}
                            onClick={() => setLeaveTarget({ id: ws.id, slug: ws.slug, name: ws.name, isActive: ws.isActive })}
                          >
                            Leave
                          </Button>
                        )}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {enableLeaveAction && (
        <>
          <div aria-live="polite" className="sr-only" data-testid="workspaces-live-region">{liveMessage}</div>
          <LeaveWorkspaceModal
            workspace={leaveTarget}
            onClose={() => setLeaveTarget(null)}
            onLeft={setLiveMessage}
          />
        </>
      )}
    </>
  );
}

// Suspense fallback (TD7) — a static skeleton, not gated by the same async
// fetch as the real list, so it can show while `WorkspacesSection` (in
// `settings/account/page.tsx`) is still resolving without blocking
// `IdentityCard` next to it.
export function WorkspacesListSkeleton() {
  return (
    <Card data-testid="workspaces-list-skeleton">
      <CardHeader className="border-b border-stroke-1 p-4">
        <h2 className="text-sm font-semibold text-fg-0">Workspaces</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-4" aria-hidden="true">
        <div className="h-3 w-2/3 animate-status-pulse rounded-1 bg-surface-3" />
        <div className="h-3 w-1/2 animate-status-pulse rounded-1 bg-surface-3" />
        <div className="h-3 w-3/5 animate-status-pulse rounded-1 bg-surface-3" />
      </CardContent>
    </Card>
  );
}
