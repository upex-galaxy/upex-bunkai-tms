'use client';

import type { OAuthErrorCode } from '@lib/auth/oauth';
import { OAUTH_ERROR_TOASTS } from '@lib/auth/oauth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

// Surfaces OAuth failures that round-trip back to /login as `?error=<code>`
// (BK-3, AC-4 / AC-7 / AC-9). Fires a Sonner toast once on mount, then strips
// the param so a refresh does not replay it. Reads `useSearchParams()`, so the
// page wraps it in <Suspense>.
function isOAuthErrorCode(value: string | null): value is OAuthErrorCode {
  return value !== null && value in OAUTH_ERROR_TOASTS;
}

export function LoginErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  const error = searchParams.get('error');

  useEffect(() => {
    if (fired.current || !isOAuthErrorCode(error)) {
      return;
    }
    fired.current = true;

    const { title, description, variant } = OAUTH_ERROR_TOASTS[error];
    if (variant === 'destructive') {
      toast.error(title, { description });
    }
    else {
      toast(title, { description });
    }

    // Strip the ?error= param so a reload doesn't re-toast. Preserve `next`.
    const params = new URLSearchParams(searchParams);
    params.delete('error');
    params.delete('reason');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [error, searchParams, router, pathname]);

  return null;
}
