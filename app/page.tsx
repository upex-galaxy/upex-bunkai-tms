import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';

// Root entry. Decide where to send the visitor based on auth state instead of
// unconditionally bouncing everyone to /login: a signed-in user hitting `/`
// should land in the app, not be shown the login screen.
//
// BK-255 — that landing route is now /home (the dashboard), not /projects. It
// carries the same no-workspace guard /projects has always had, so a member
// without a workspace still ends up at /onboarding.
export default async function RootEntryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? '/home' : '/login');
}
