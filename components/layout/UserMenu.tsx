'use client';

import { useAuth } from '@components/providers/auth-context';
import { cn } from '@lib/utils';
import { ChevronDown, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// Account affordance: surfaces the signed-in identity and the ONLY logout
// control in the app. `signOut()` existed in auth-context with zero callers
// before this. Deliberately minimal — the full account/settings surface
// (identity + role + tokens + workspaces) is BK-86. Mounted on the project
// Topbar and, as a floating control, on the chrome-less /projects and
// /onboarding screens so a signed-in user can always end their session.
export function UserMenu({ className }: { className?: string }) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const email = user?.email ?? '';
  const initial = email ? email[0].toUpperCase() : '?';

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleSignOut = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    const { error } = await signOut();
    if (error) {
      toast.error(error.message || 'Could not sign out.');
      setBusy(false);
      return;
    }
    setOpen(false);
    router.push('/login');
    router.refresh();
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        title={email || 'Account'}
        aria-label="Account menu"
        className="flex h-7 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-1.5 text-sm text-fg-1 hover:border-stroke-3 hover:bg-surface-3"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-semibold text-surface-0">
          {initial}
        </span>
        <span className="hidden max-w-[160px] truncate text-fg-2 sm:inline">{email || 'Account'}</span>
        <ChevronDown size={11} className="text-fg-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-[240px] rounded-3 border border-stroke-2 bg-surface-1 p-2 shadow-lg">
            <div className="px-2 py-1">
              <div className="font-mono text-xs font-semibold uppercase tracking-widest text-fg-4">
                Signed in as
              </div>
              <div className="mt-0.5 truncate text-sm text-fg-1" title={email}>{email || '—'}</div>
            </div>
            <button
              type="button"
              onClick={() => { void handleSignOut(); }}
              disabled={busy}
              className="mt-1 flex w-full items-center gap-2 rounded-2 border-t border-stroke-2 px-2 pt-2 text-sm text-fg-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut size={14} className="text-fg-3" />
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
