'use client';

import { WORKSPACE_DELETED_NOTICE, workspaceDeletedToast } from '@lib/workspaces/deleted-notice';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

// BK-1129 — BK-512 Scenario N3's announcement. A Runner whose workspace was
// deleted sends the caller to `/home?notice=workspace-deleted` (or onboarding
// when nothing remains); by then the shell has re-pointed them through the
// AC-09 resolver, so this only has to say what happened and where they are
// now. Fires once, then strips the param so a refresh does not replay it —
// same pattern as `OpenInboxFromQuery` and `login-error-toast.tsx`, and wrapped
// in <Suspense> by the layout for the same `useSearchParams()` reason.
export function WorkspaceDeletedNotice({ activeWorkspaceName }: { activeWorkspaceName: string | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  const shouldAnnounce = searchParams.get('notice') === WORKSPACE_DELETED_NOTICE;

  useEffect(() => {
    if (fired.current || !shouldAnnounce) {
      return;
    }
    fired.current = true;
    toast.warning(workspaceDeletedToast(activeWorkspaceName));

    const params = new URLSearchParams(searchParams);
    params.delete('notice');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [shouldAnnounce, activeWorkspaceName, searchParams, router, pathname]);

  return null;
}
