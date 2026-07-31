'use client';

import type { RevokeTokenTarget } from '@components/settings/RevokeTokenModal';
import type { TokenRow, WorkspaceOption } from '@lib/tokens/view-state';
import { IssueTokenModal } from '@components/settings/IssueTokenModal';
import { RevokeTokenModal } from '@components/settings/RevokeTokenModal';
import { Badge } from '@components/ui/badge';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { formatExpiryCell, formatWorkspaceCell } from '@lib/tokens/format';
import { resolveTokensViewState } from '@lib/tokens/view-state';
import { cn } from '@lib/utils';
import { KeyRound, Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface TokensListProps {
  tokens: TokenRow[]
  workspaces: WorkspaceOption[]
  error?: boolean
}

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-4';

// Settings > Tokens list + revoke + issue flow (BK-88 Slice A+B — AC1-AC8).
// Client component: revoke and issuance are both interactive (open their own
// modal, then `router.refresh()`s on success) and the error state's Retry
// button needs the same interactivity. All Supabase I/O happens in the
// caller's own async server component (`settings/tokens/page.tsx`'s
// `TokensSection`) -- this component only renders whatever it is handed
// (TD7 isolation).
export function TokensList({ tokens, workspaces, error = false }: TokensListProps) {
  const router = useRouter();
  const [revokeTarget, setRevokeTarget] = useState<RevokeTokenTarget | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const state = resolveTokensViewState({ error, rowCount: tokens.length });
  const activeCount = tokens.filter(t => t.revokedAt === null).length;

  return (
    <>
      <Card data-testid="tokens-list" role="region" aria-labelledby="settings-tokens-heading">
        <CardHeader className="flex-row items-center gap-3 border-b border-stroke-1 p-4">
          <h2 id="settings-tokens-heading" className="text-sm font-semibold text-fg-0">Your tokens</h2>
          {state === 'list' && (
            <Badge variant="secondary">
              {activeCount}
              {' '}
              active
            </Badge>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="ml-auto"
            data-testid="issue-token-open"
            onClick={() => setIssueOpen(true)}
          >
            <Plus size={13} />
            New token
          </Button>
        </CardHeader>

        {state === 'error' && (
          <CardContent className="flex flex-col gap-3 p-4" data-testid="tokens-error">
            <p className="text-sm text-fg-2">
              We couldn&apos;t load your tokens. Existing tokens keep working -- only this view failed.
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                data-testid="tokens-retry"
                onClick={() => router.refresh()}
              >
                <RefreshCw size={13} />
                Retry
              </Button>
            </div>
          </CardContent>
        )}

        {state === 'empty' && (
          <CardContent className="flex flex-col gap-2 p-4" data-testid="tokens-empty">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg-0">
              <KeyRound size={14} className="text-fg-3" />
              No personal access tokens
            </div>
            <p className="text-sm text-fg-2">
              Tokens let the Bunkai CLI and your CI act as you without your password. Issue one, store the secret in your CI vault, and revoke it any time.
            </p>
            <div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="tokens-empty-issue"
                onClick={() => setIssueOpen(true)}
              >
                Issue your first token
              </Button>
            </div>
          </CardContent>
        )}

        {state === 'list' && (
          <div data-testid="tokens-rows" role="table" aria-label="Personal access tokens">
            <div role="row" className={cn(ROW_GRID, 'border-b border-stroke-1 px-4 py-2 text-xs uppercase tracking-wide text-fg-3')}>
              <span role="columnheader">Token</span>
              <span role="columnheader">Scopes</span>
              <span role="columnheader">Workspace</span>
              <span role="columnheader">Created</span>
              <span role="columnheader">Expires</span>
              <span role="columnheader" className="sr-only">Actions</span>
            </div>

            {tokens.map((token) => {
              const revoked = token.revokedAt !== null;
              const displayName = token.name ?? token.prefix;
              const workspace = formatWorkspaceCell(token.workspaceId, token.workspaceLabel);
              const expiry = formatExpiryCell(token.expiresAt, new Date());
              // An already-revoked row reads as inert history (Decision 1) --
              // the expiring-soon signal only matters for actionable tokens.
              const showExpiringSoon = !revoked && expiry.isExpiringSoon;
              const cellTone = revoked ? 'text-fg-4' : 'text-fg-2';

              return (
                <div
                  key={token.id}
                  data-testid={`token-row-${token.id}`}
                  role="row"
                  className={cn(
                    ROW_GRID,
                    'border-b border-stroke-1 px-4 py-3 last:border-b-0',
                    !revoked && 'hover:bg-surface-3',
                  )}
                >
                  <div role="cell" className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        'flex items-center gap-2 truncate font-mono text-sm font-semibold',
                        revoked ? 'text-fg-3 line-through decoration-fg-4' : 'text-fg-0',
                      )}
                    >
                      {displayName}
                      {revoked && (
                        <Badge variant="outline" className="shrink-0 border-transparent bg-signal-fail-bg text-2xs text-signal-fail no-underline">
                          revoked
                        </Badge>
                      )}
                    </span>
                    <span className="font-mono text-xs text-fg-3">
                      bk_pat_
                      {token.prefix}
                    </span>
                  </div>

                  <div role="cell" className="flex flex-wrap gap-1">
                    {token.scopes.map(scope => (
                      <Badge
                        key={scope}
                        variant="outline"
                        className={cn('font-mono text-2xs', revoked && 'border-stroke-1 bg-transparent text-fg-4')}
                      >
                        {scope}
                      </Badge>
                    ))}
                  </div>

                  <div role="cell" className={cn('min-w-0 text-sm', cellTone)}>
                    <span className="block truncate">{workspace.label}</span>
                    {workspace.subLabel && (
                      <span className="block font-mono text-xs text-fg-3">{workspace.subLabel}</span>
                    )}
                  </div>

                  <div role="cell" className={cn('whitespace-nowrap font-mono text-xs', cellTone)}>
                    {new Date(token.createdAt).toISOString().slice(0, 10)}
                  </div>

                  <div role="cell" className={cn('whitespace-nowrap font-mono text-xs', cellTone)}>
                    {showExpiringSoon
                      ? (
                          <>
                            <Badge variant="outline" className="border-transparent bg-signal-blocked-bg font-mono text-2xs text-signal-blocked">
                              {expiry.label}
                            </Badge>
                            <span className="block font-sans text-2xs normal-case text-fg-3">
                              expires in
                              {' '}
                              {expiry.daysUntilExpiry}
                              {' '}
                              {expiry.daysUntilExpiry === 1 ? 'day' : 'days'}
                            </span>
                          </>
                        )
                      : expiry.label}
                  </div>

                  <div role="cell" className="flex justify-end">
                    {revoked
                      ? (
                          <span data-testid={`token-revoked-note-${token.id}`} className="whitespace-nowrap font-mono text-sm text-fg-3">
                            revoked
                            {' '}
                            {token.revokedAt ? new Date(token.revokedAt).toISOString().slice(0, 10) : ''}
                          </span>
                        )
                      : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`token-revoke-${token.id}`}
                            aria-label={`Revoke token ${displayName} (bk_pat_${token.prefix})`}
                            onClick={() => setRevokeTarget({ id: token.id, name: displayName, prefix: token.prefix })}
                          >
                            Revoke
                          </Button>
                        )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <RevokeTokenModal token={revokeTarget} onClose={() => setRevokeTarget(null)} />
      <IssueTokenModal open={issueOpen} onClose={() => setIssueOpen(false)} workspaces={workspaces} />
    </>
  );
}

// Suspense fallback (TD7) -- a static skeleton, not gated by the same async
// fetch as the real list, mirroring `WorkspacesListSkeleton`'s pattern.
export function TokensListSkeleton() {
  return (
    <Card data-testid="tokens-list-skeleton">
      <CardHeader className="border-b border-stroke-1 p-4">
        <h2 className="text-sm font-semibold text-fg-0">Your tokens</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4" aria-hidden="true">
        {[3 / 5, 1 / 2, 2 / 3].map((width, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_90px_70px] gap-4">
            <div className="h-3 animate-status-pulse rounded-1 bg-surface-3" style={{ width: `${width * 100}%` }} />
            <div className="h-3 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 animate-status-pulse rounded-1 bg-surface-3" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
