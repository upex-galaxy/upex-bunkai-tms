import type { ReactNode } from 'react';
import { SettingsNav } from '@components/settings/SettingsNav';
import { createClient } from '@lib/supabase/server';
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

  return (
    <div className="flex h-full min-h-0">
      <SettingsNav />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
