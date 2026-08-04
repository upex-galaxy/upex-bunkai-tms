import { listNotificationPreferences } from '@app/api/v1/notification-preferences/response';
import { NotificationPreferencesGrid } from '@components/settings/NotificationPreferencesGrid';
import { buildPreferenceGrid } from '@lib/notification-preferences/grid';
import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';

// Settings > Notifications (BK-213 — AC1-AC5). Extends the live Settings hub
// (BK-87) rather than the mockup's separate icon rail (Rule #14: live shell
// wins) — `SettingsLayout` already nests this route inside the app shell +
// `SettingsNav`. Personal + GLOBAL preferences: no workspace concept, so
// (unlike `settings/account/page.tsx`) there is no active-workspace cookie
// read here at all.
//
// Fully self-scoped: the caller's own RLS-scoped client is enough (migration
// 0062's `notification_preferences_select_own`) — no admin client, matching
// this story's "self-contained CRUD, reuse the existing self-scoped auth
// pattern" scoping.
export default async function SettingsNotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The route layout above (`settings/layout.tsx`) already guards this tree;
  // this check is unreachable in practice but keeps the page self-defensive
  // on its own (mirrors `settings/account/page.tsx`).
  if (!user) {
    redirect('/login?next=/settings/notifications');
  }

  let preferences = buildPreferenceGrid([]);
  try {
    preferences = await listNotificationPreferences(supabase, user.id);
  }
  catch {
    // Fall through with the all-default grid rather than a blank/broken
    // page — a transient read failure should never block the caller from
    // still seeing (and re-saving) their preferences.
  }

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-1 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-fg-0">Notifications</h1>
      <p className="text-base text-fg-2">
        Choose how Bunkai reaches you for each kind of workspace event. Each toggle controls one event type on one channel — nothing else.
      </p>
      <NotificationPreferencesGrid preferences={preferences} />
    </div>
  );
}
