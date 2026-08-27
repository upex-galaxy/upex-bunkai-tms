import { UpgradeView } from '@components/billing/UpgradeView';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Settings > Billing > Upgrade (BK-230 — AC1-AC5). Same cookie-driven active
// workspace resolution as `settings/billing/page.tsx`; additionally resolves
// `isOwner` here (server-side, one RPC call) so `UpgradeView` can render the
// owner vs read-only comparison without a second client-side round trip.
// `bunkai_is_workspace_owner` is the same RLS helper the checkout/cancel
// routes and the billing_checkout_sessions RLS policies use — this is a
// DISPLAY hint only, never the authorization boundary (that lives
// server-side in lib/billing/checkout.ts + RLS, re-checked on every write).
export default async function SettingsBillingUpgradePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/settings/billing/upgrade');
  }

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const list = workspaces ?? [];

  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(cookieActive, list.map(w => w.id));

  let isOwner = false;
  if (activeWorkspaceId) {
    const { data } = await supabase.rpc('bunkai_is_workspace_owner', { ws_id: activeWorkspaceId });
    isOwner = data === true;
  }

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-1 px-6 py-8">
      <div className="mb-2 text-[12.5px] text-fg-3">
        Settings
        {' '}
        <span className="mx-1 text-fg-4">/</span>
        {' '}
        Billing
        {' '}
        <span className="mx-1 text-fg-4">/</span>
        {' '}
        <span className="text-fg-1">Upgrade</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-fg-0">Upgrade your plan</h1>
      <p className="mb-4 text-base text-fg-2">Compare tiers and pick your seat count. Changes apply immediately once payment is confirmed.</p>
      <UpgradeView workspaceId={activeWorkspaceId} isOwner={isOwner} />
    </div>
  );
}
