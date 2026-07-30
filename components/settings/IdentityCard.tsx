import type { MemberRole } from '@lib/types';
import { Badge } from '@components/ui/badge';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { formatLastActive, formatMemberSince } from '@lib/account/format';
import { emailInitials } from '@lib/account/initials';
import { NO_WORKSPACE_LABEL, roleLabel } from '@lib/account/role-label';

interface IdentityCardProps {
  email: string | null
  role: MemberRole | null
  workspaceName: string | null
  workspaceSlug: string | null
  memberSince: string | null
  lastActive: string | null
}

// Settings > Account identity card (BK-87, TC-AC1). No sign-out control and no
// danger zone: sign-out stays exclusively in BK-86's account-menu dropdown,
// and account deletion has no story yet (TD1 — deliberate mockup divergence).
// Email is the only identity label — no code path in this repo reads/writes
// `user_metadata` (TD6), so there is no display-name fallback to render.
export function IdentityCard({ email, role, workspaceName, workspaceSlug, memberSince, lastActive }: IdentityCardProps) {
  const hasWorkspace = role != null && workspaceName != null;

  return (
    <Card data-testid="identity-card">
      <CardHeader className="flex-row items-center gap-3 border-b border-stroke-1 p-4">
        <h2 className="text-sm font-semibold text-fg-0">Identity</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-stroke-3 bg-surface-4 font-mono text-lg font-semibold text-fg-0"
          >
            {emailInitials(email)}
          </span>
          <span data-testid="identity-email" className="font-mono text-sm text-fg-1">
            {email ?? '—'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-stroke-1 pt-4 sm:grid-cols-3">
          <div>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-3">
              Role in active workspace
            </div>
            <div data-testid="identity-role" className="flex flex-wrap items-center gap-2 text-sm text-fg-1">
              {hasWorkspace
                ? (
                    <>
                      <Badge variant="secondary">{roleLabel(role)}</Badge>
                      <span className="font-mono text-xs text-fg-3">
                        {workspaceSlug}
                        {' · '}
                        {workspaceName}
                      </span>
                    </>
                  )
                : (
                    <span className="text-fg-3">{NO_WORKSPACE_LABEL}</span>
                  )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-3">Member since</div>
            <div data-testid="identity-member-since" className="font-mono text-sm text-fg-1">
              {formatMemberSince(memberSince)}
            </div>
          </div>
          <div>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-3">Last active</div>
            <div data-testid="identity-last-active" className="font-mono text-sm text-fg-1">
              {formatLastActive(lastActive)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
