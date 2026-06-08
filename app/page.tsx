import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';

// Root entry. Decide where to send the visitor based on auth state instead of
// unconditionally bouncing everyone to /login: a signed-in user hitting `/`
// should land in the app (/projects, which itself redirects to /onboarding
// when they have no workspace), not be shown the login screen.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? '/projects' : '/login');
}
