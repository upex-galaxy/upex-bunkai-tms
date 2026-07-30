import type { MemberRole } from '@lib/types';
import { IdentityCard } from '@components/settings/IdentityCard';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Settings > Account (BK-87 PR1 — TC-AC1, TC-AC3). Identity is real; the
// workspace section below is a static loading placeholder in this slice
// (BK-87 branch plan: PR2 swaps it for the real <WorkspacesList>). The page
// is fully working and honest on its own — never a broken or fake-empty
// state — per the stacked-to-main contract.
export default async function SettingsAccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The route layout above already guards this tree; this check is
  // unreachable in practice but keeps the page self-defensive on its own.
  if (!user) {
    redirect('/login?next=/settings/account');
  }

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, slug, name')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));
  const activeWorkspace = list.find(w => w.id === activeWorkspaceId) ?? null;

  // Caller's role + joined_at in the active workspace (TD4) — same
  // cookie-driven resolution + membership read (app)/layout.tsx's
  // getShellData() already runs, widened by one column (joined_at).
  let role: MemberRole | null = null;
  let memberSince: string | null = null;
  if (activeWorkspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role, joined_at')
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    role = (membership?.role as MemberRole | undefined) ?? null;
    memberSince = membership?.joined_at ?? null;
  }

  // Email + last_sign_in_at live in auth.users (not exposed via PostgREST) —
  // the exact admin-lookup pattern GET /api/v1/me already runs. Best-effort:
  // a failed lookup still renders the page with the session's own email.
  let email = user.email ?? null;
  let lastActive: string | null = null;
  try {
    const { data: lookup, error } = await createAdminClient().auth.admin.getUserById(user.id);
    if (!error) {
      email = lookup.user?.email ?? email;
      lastActive = lookup.user?.last_sign_in_at ?? null;
    }
  }
  catch {
    // Silent fallback: keep the session's email, no last-active reading.
  }

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Account</h1>
        <p className="text-base text-fg-2">Your identity and workspaces in Bunkai.</p>
      </div>

      <IdentityCard
        email={email}
        role={role}
        workspaceName={activeWorkspace?.name ?? null}
        workspaceSlug={activeWorkspace?.slug ?? null}
        memberSince={memberSince}
        lastActive={lastActive}
      />

      {/* Workspaces — static placeholder in this slice. BK-87 PR2 swaps this
          for <Suspense><WorkspacesList /></Suspense> (TC-AC2/6/7). */}
      <section
        aria-labelledby="settings-workspaces-heading"
        data-testid="settings-workspaces-placeholder"
        className="rounded-3 border border-stroke-2 bg-surface-2 shadow-card"
      >
        <div className="border-b border-stroke-1 px-4 py-3">
          <h2 id="settings-workspaces-heading" className="text-sm font-semibold text-fg-0">Workspaces</h2>
        </div>
        <div className="flex flex-col gap-2 p-4" aria-hidden="true">
          <div className="h-3 w-2/3 animate-status-pulse rounded-1 bg-surface-3" />
          <div className="h-3 w-1/2 animate-status-pulse rounded-1 bg-surface-3" />
          <div className="h-3 w-3/5 animate-status-pulse rounded-1 bg-surface-3" />
        </div>
        <p className="px-4 pb-4 text-sm text-fg-3">Full workspace list is on its way.</p>
      </section>
    </div>
  );
}
