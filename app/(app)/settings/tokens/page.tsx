import type { TokenRow } from '@lib/tokens/view-state';
import { TokensList, TokensListSkeleton } from '@components/settings/TokensList';
import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

// Settings > Tokens -- real screen (BK-88 Slice A: list + revoke). Replaces
// the `ComingSoon` placeholder BK-87 left here. Issuance (AC1-AC4) is
// Slice B's `IssueTokenModal`, added in a follow-up PR.
export default async function SettingsTokensPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The route layout above already guards this tree; this check is
  // unreachable in practice but keeps the page self-defensive on its own
  // (matches settings/account/page.tsx's convention).
  if (!user) {
    redirect('/login?next=/settings/tokens');
  }

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Personal access tokens</h1>
        <p className="text-base text-fg-2">Authenticate the Bunkai CLI and your CI against your account.</p>
      </div>

      <Suspense fallback={<TokensListSkeleton />}>
        <TokensSection />
      </Suspense>
    </div>
  );
}

// Token list (BK-88 Slice A -- AC5, AC6, AC7). A separate async server
// component (not the page itself) so it streams inside its own `<Suspense>`
// boundary above, matching the TD7 isolation pattern already established by
// settings/account/page.tsx's `WorkspacesSection`.
//
// TD7: any failure here is caught locally and rendered as `TokensList`'s own
// error state -- it must never throw up to the route's `error.tsx`.
async function TokensSection() {
  try {
    const supabase = await createClient();

    // Same column list GET /api/v1/tokens already selects -- RLS scopes this
    // to the caller's own tokens (auth.uid() = user_id), so no explicit
    // .eq('user_id', ...) is needed.
    const { data: tokens, error } = await supabase
      .from('access_tokens')
      .select('id, name, scopes, workspace_id, token_prefix, expires_at, revoked_at, last_used_at, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }

    const rows = tokens ?? [];
    const workspaceIds = Array.from(
      new Set(rows.map(t => t.workspace_id).filter((id): id is string => id !== null)),
    );

    // Resolves each token's workspace binding to a display name (Decision 3's
    // "Workspace" column). Deliberately NOT the caller's active memberships
    // query -- that only matters for Slice B's issuance-form dropdown.
    const workspaceLabels = new Map<string, string>();
    if (workspaceIds.length > 0) {
      const { data: workspaces, error: workspacesError } = await supabase
        .from('workspaces')
        .select('id, name')
        .in('id', workspaceIds);
      if (workspacesError) {
        throw workspacesError;
      }
      for (const workspace of workspaces ?? []) {
        workspaceLabels.set(workspace.id, workspace.name);
      }
    }

    const tokenRows: TokenRow[] = rows.map(t => ({
      id: t.id,
      name: t.name,
      prefix: t.token_prefix,
      scopes: t.scopes,
      workspaceId: t.workspace_id,
      workspaceLabel: t.workspace_id ? (workspaceLabels.get(t.workspace_id) ?? null) : null,
      expiresAt: t.expires_at,
      revokedAt: t.revoked_at,
      createdAt: t.created_at,
    }));

    return <TokensList tokens={tokenRows} />;
  }
  catch {
    return <TokensList tokens={[]} error />;
  }
}
