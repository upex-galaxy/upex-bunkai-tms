'use client';

import type { LoginErrorCode } from '@lib/auth/login-errors';
import { LOGIN_ERROR_TOASTS } from '@lib/auth/login-errors';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

// Surfaces sign-in failures that round-trip back to /login as `?error=<code>` —
// OAuth (BK-3, AC-4 / AC-7 / AC-9) and, since BK-400, the magic-link rail too.
// Fires a Sonner toast once on mount, then strips the param so a refresh does
// not replay it. Reads `useSearchParams()`, so the page wraps it in <Suspense>.
function isLoginErrorCode(value: string | null): value is LoginErrorCode {
  return value !== null && value in LOGIN_ERROR_TOASTS;
}

export function LoginErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  const error = searchParams.get('error');

  useEffect(() => {
    if (fired.current || !isLoginErrorCode(error)) {
      return;
    }
    fired.current = true;

    const { title, description, variant } = LOGIN_ERROR_TOASTS[error];
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
