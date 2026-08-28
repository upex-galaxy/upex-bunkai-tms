'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

// BK-214 — the digest email's "Open inbox" link lands on
// `/home?openNotifications=1` (no dedicated inbox route exists — D17 ratified
// the sidebar-bell + panel placement, master-design-plan.md §5). This opens
// the existing panel once on mount via the `onOpen` callback, then strips the
// param so a refresh doesn't reopen it. Isolated into its own component
// (mirrors `app/(auth)/login/login-error-toast.tsx`) because `useSearchParams()`
// requires a `<Suspense>` boundary around its consumer, and `AppSidebar` — a
// large, eagerly-rendered component — is not one.
export function OpenInboxFromQuery({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  const shouldOpen = searchParams.get('openNotifications') === '1';

  useEffect(() => {
    if (fired.current || !shouldOpen) {
      return;
    }
    fired.current = true;
    onOpen();

    const params = new URLSearchParams(searchParams);
    params.delete('openNotifications');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [shouldOpen, searchParams, router, pathname, onOpen]);

  return null;
}
