import type { MemberRole } from '@lib/types';
import type { ReactNode } from 'react';
import { SettingsNav } from '@components/settings/SettingsNav';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Server boundary for the whole /settings tree (BK-87, TC-AC4). Defense-in-
// depth alongside middleware.ts's PROTECTED_PREFIXES gate — mirrors the
// pattern in onboarding/page.tsx and workspaces/[id]/members/page.tsx.
//
// Nests INSIDE the existing (app)/layout.tsx shell (AppSidebar + content
// column, TD2): this only adds the 216px SettingsNav as a second column, it
// does not re-render a global shell of its own.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/settings');
  }

  // BK-740 — resolve the caller's role in the ACTIVE workspace so the nav can
  // hide workspace-scoped sections they cannot use (Billing). Same cookie-
  // driven active-workspace idiom as settings/billing/page.tsx, and the same
  // self-row membership read as lib/tests/load-test-detail.ts:79-85 — no
  // cached/shared role accessor exists in this repo to prefer over it. The
  // `status = 'active'` + role filter mirrors `bunkai_is_workspace_admin`,
  // which stays the real access control on the Billing route itself.
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const activeWorkspaceId = resolveActiveWorkspaceId(
    cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null,
    (workspaces ?? []).map(w => w.id),
  );

  let role: MemberRole | null = null;
  if (activeWorkspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    role = (membership?.role as MemberRole | undefined) ?? null;
  }

  return (
    <div className="flex h-full min-h-0">
      <SettingsNav role={role} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
