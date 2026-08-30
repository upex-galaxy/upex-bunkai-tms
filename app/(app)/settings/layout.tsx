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

  // BK-508 — Owner-only "Data export" nav entry (AC-02: absent, not
  // present-and-refused, for every other role). Same cookie/active-workspace
  // resolution as settings/billing/page.tsx; bunkai_is_workspace_owner (0005)
  // is display-only here — the route's own assertExportAuthorized + RLS are
  // the real enforcement point, same convention as billing/upgrade/page.tsx's
  // isOwner hint.
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, (workspaces ?? []).map(w => w.id));
  const { data: isOwner } = activeWorkspaceId
    ? await supabase.rpc('bunkai_is_workspace_owner', { ws_id: activeWorkspaceId })
    : { data: false };

  return (
    <div className="flex h-full min-h-0">
      <SettingsNav showDataExport={isOwner ?? false} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
