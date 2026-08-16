import { BillingOverviewView } from '@components/billing/BillingOverviewView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Settings > Billing (BK-229 — AC1-AC18). Extends the live Settings hub
// (BK-87) rather than the mockup's separate icon rail (Rule #14: live shell
// wins) — `SettingsLayout` already nests this route inside the app shell +
// `SettingsNav`.
//
// This page only resolves the active workspace id (same cookie-driven
// pattern as `settings/account/page.tsx`) and hands it to the client view,
// which owns the fetch/loading/error/retry lifecycle (AC "loading state",
// "API failure", "API timeout"). Access control is NOT re-implemented here:
// `bunkai_workspace_billing_overview`'s own step-0 admin gate is the single
// source of truth, and a non-admin caller simply gets the route's uniform
// 404 — the view renders that as an honest "not available" state rather
// than this page trying to predict the RPC's answer.
export default async function SettingsBillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The route layout above already guards this tree; this check is
  // unreachable in practice but keeps the page self-defensive on its own.
  if (!user) {
    redirect('/login?next=/settings/billing');
  }

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-1 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-fg-0">Billing</h1>
      <p className="mb-4 text-base text-fg-2">Plan, seats, and usage for this workspace.</p>
      <BillingOverviewView workspaceId={activeWorkspaceId} />
    </div>
  );
}
