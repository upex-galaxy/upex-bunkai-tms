import type { TokenRow, WorkspaceOption } from '@lib/tokens/view-state';
import { TokensList, TokensListSkeleton } from '@components/settings/TokensList';
import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

// Settings > Tokens -- real screen (BK-88 Slice A+B: list, revoke, issue).
// Replaces the `ComingSoon` placeholder BK-87 left here.
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
        <TokensSection userId={user.id} />
      </Suspense>
    </div>
  );
}

// Token list + issuance-form workspace options (BK-88 Slice A -- AC5, AC6,
// AC7; Slice B -- Risk 2). A separate async server component (not the page
// itself) so it streams inside its own `<Suspense>` boundary above, matching
// the TD7 isolation pattern already established by
// settings/account/page.tsx's `WorkspacesSection`.
//
// TD7: any failure in the token-list query is caught locally and rendered as
// `TokensList`'s own error state -- it must never throw up to the route's
// `error.tsx`.
async function TokensSection({ userId }: { userId: string }) {
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
    // query -- that only matters for the issuance-form dropdown below.
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

    return <TokensList tokens={tokenRows} workspaces={await loadWorkspaceOptions(userId)} />;
  }
  catch {
    return <TokensList tokens={[]} error workspaces={await loadWorkspaceOptions(userId)} />;
  }
}

// Issuance form's workspace dropdown options (Slice B, Risk 2) -- the
// caller's own active memberships, narrowed to {id, slug, name}, same query
// shape as account/page.tsx's `WorkspacesSection`. Isolated in its own
// try/catch, independent of the token-list query above (TD7): a failure here
// must not blank the token list -- the form simply falls back to "All
// workspaces" only, which is always a usable choice regardless of membership
// count.
async function loadWorkspaceOptions(userId: string): Promise<WorkspaceOption[]> {
  try {
    const supabase = await createClient();

    const { data: memberships, error: membershipsError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (membershipsError) {
      throw membershipsError;
    }

    const workspaceIds = (memberships ?? []).map(m => m.workspace_id);
    if (workspaceIds.length === 0) {
      return [];
    }

    const { data: workspaces, error: workspacesError } = await supabase
      .from('workspaces')
      .select('id, slug, name')
      .in('id', workspaceIds);
    if (workspacesError) {
      throw workspacesError;
    }

    return workspaces ?? [];
  }
  catch {
    return [];
  }
}
