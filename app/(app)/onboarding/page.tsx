import { createClient } from '@lib/supabase/server';
import { redirect } from 'next/navigation';
import { hasLiveMembership } from './live-membership';
import { OnboardingForm } from './onboarding-form';

// Server boundary: confirms the user is signed in, then short-circuits to
// `/projects` if they already belong to a LIVE workspace (BK-1903: a
// membership in a soft-deleted workspace does not count). The client component
// handles slug input + RPC call + redirect on success.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/onboarding');
  }

  if (await hasLiveMembership(supabase, user.id)) {
    redirect('/projects');
  }

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-surface-0 px-6 [align-items:safe_center]">
      <OnboardingForm userEmail={user.email ?? ''} />
    </div>
  );
}
