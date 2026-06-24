'use client';

import type { MemberRole } from '@lib/types';
import type { ComponentType } from 'react';
import { CommandPalette } from '@components/layout/CommandPalette';
import { useAuth } from '@components/providers/auth-context';
import { emailInitials } from '@lib/account/initials';
import { NO_WORKSPACE_LABEL, roleLabel } from '@lib/account/role-label';
import { cn } from '@lib/utils';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  BarChart3,
  Bug,
  Check,
  ChevronDown,
  Folder,
  Home,
  Library,
  LogOut,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// Global navigation shell — the persistent left rail rendered on every (app)
// route. This is the mockup's app-shell sidebar (Logo, workspace switcher,
// search, primary nav, pinned projects, user block). NOTE: distinct from
// components/layout/Sidebar.tsx, which is the per-project module-tree explorer
// that lives INSIDE this rail's main column.
//
// Per the Master Design Plan (§3): nav targets without a route yet render
// disabled with a "soon" tag; badges show real counts only where data exists.

interface ShellWorkspace {
  id: string
  slug: string
  name: string
}

interface ShellProject {
  id: string
  slug: string
  name: string
}

interface AppSidebarProps {
  workspaces: ShellWorkspace[]
  activeWorkspaceId: string | null
  projects: ShellProject[]
  userEmail: string | null
  userRole: MemberRole | null
}

interface NavItem {
  id: string
  icon: ComponentType<{ size?: number, className?: string }>
  label: string
  href: string | null
  badge?: number
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) { return '??'; }
  if (parts.length === 1) { return parts[0].slice(0, 2).toUpperCase(); }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Mockup pinned-project rows show a mono "code" prefix. Project has no `code`
// column, so derive a short token from the slug (honest, deterministic).
function projectCode(slug: string): string {
  return slug.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || '—';
}

export function AppSidebar({ workspaces, activeWorkspaceId, projects, userEmail, userRole }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  const [wsOpen, setWsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const nav: NavItem[] = [
    { id: 'home', icon: Home, label: 'Home', href: null },
    { id: 'projects', icon: Folder, label: 'Projects', href: '/projects', badge: projects.length },
    { id: 'library', icon: Library, label: 'ATC Library', href: null },
    { id: 'runs', icon: Play, label: 'Test Runs', href: null },
    { id: 'bugs', icon: Bug, label: 'Bug Reports', href: null },
    { id: 'metrics', icon: BarChart3, label: 'Metrics', href: null },
    { id: 'settings', icon: Settings, label: 'Settings', href: null },
  ];

  const isActive = (href: string | null) =>
    href !== null && (pathname === href || pathname.startsWith(`${href}/`));

  // Escape closes the workspace switcher. The account menu is a Radix
  // DropdownMenu and owns its own Escape / focus-return, so it is intentionally
  // not handled here (BK-86 — migrate only the account menu).
  useEffect(() => {
    if (!wsOpen) { return; }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setWsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wsOpen]);

  const switchWorkspace = async (workspaceId: string) => {
    if (busy || workspaceId === activeWorkspaceId) { setWsOpen(false); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/me/active-workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        toast.error(body.error?.message ?? 'Could not switch workspace.');
        return;
      }
      setWsOpen(false);
      router.replace('/projects');
      router.refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (busy) { return; }
    setBusy(true);
    try {
      const { error } = await signOut();
      if (error) {
        toast.error(error.message || 'Could not sign out.');
        setBusy(false);
        return;
      }
    }
    catch {
      // A failed server-side revoke (e.g. an already-expired OAuth token) still
      // clears the local session. Fall through to the redirect rather than
      // stranding the user on a stale, signed-out page.
    }
    // Hard navigation guarantees an immediate redirect to a freshly
    // server-rendered /login (cookies are already cleared), instead of relying on
    // a soft client nav that can be skipped if signOut() rejects.
    window.location.assign('/login');
  };

  const email = userEmail ?? '';
  const userInitial = emailInitials(email);
  const roleText = roleLabel(userRole);
  const hasWorkspaceRole = userRole != null;

  return (
    <aside className="flex h-screen flex-col overflow-hidden border-r border-stroke-1 bg-surface-1">
      {/* Logo + New */}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-3.5">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-1 bg-accent font-jp text-base font-bold leading-none tracking-tight text-white">
            分
          </span>
          <span className="text-base font-bold tracking-tight text-fg-0">Bunkai</span>
        </span>
        <Link
          href="/projects"
          title="New project"
          className="inline-flex size-6 items-center justify-center rounded-2 text-fg-3 hover:bg-surface-2 hover:text-fg-1"
        >
          <Plus size={14} />
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="relative px-2 pb-2.5">
        <button
          type="button"
          onClick={() => { setWsOpen(p => !p); }}
          className="flex w-full items-center justify-between gap-2 rounded-2 border border-stroke-1 px-2 py-1.5 text-sm hover:bg-surface-2"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="inline-flex size-4 items-center justify-center rounded-1 bg-gradient-to-br from-[#3a4252] to-[#1f2330] text-2xs font-bold text-fg-1">
              {activeWorkspace ? initials(activeWorkspace.name) : '··'}
            </span>
            <span className="truncate font-semibold text-fg-1">
              {activeWorkspace?.name ?? 'No workspace'}
            </span>
          </span>
          <ChevronDown size={12} className="shrink-0 text-fg-3" />
        </button>

        {wsOpen && (
          <>
            <div className="fixed inset-0 z-40" aria-hidden onClick={() => setWsOpen(false)} />
            <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-3 border border-stroke-2 bg-surface-1 p-2 shadow-pop">
              <div className="px-2 py-1 font-mono text-2xs font-semibold uppercase tracking-widest text-fg-4">
                Switch workspace
              </div>
              <ul className="m-0 grid gap-0.5 p-0">
                {workspaces.map(w => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => { void switchWorkspace(w.id); }}
                      className="flex w-full items-center justify-between rounded-2 px-2 py-1.5 text-sm text-fg-1 hover:bg-surface-2"
                    >
                      <span className="truncate">{w.name}</span>
                      {w.id === activeWorkspaceId && <Check size={14} className="text-accent" />}
                    </button>
                  </li>
                ))}
                {workspaces.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-fg-4">No workspaces</li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Search (⌘K) — opens the command palette; also bound to ⌘K globally */}
      <div className="px-2 pb-2.5">
        <button
          type="button"
          data-testid="sidebar-search"
          onClick={() => setPaletteOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-2 bg-surface-2 px-2 py-1.5 text-sm text-fg-3 hover:bg-surface-3"
        >
          <span className="inline-flex items-center gap-1.5">
            <Search size={13} className="text-fg-3" />
            Search or jump to…
          </span>
          <span className="inline-flex gap-1">
            <span className="kbd">⌘</span>
            <span className="kbd">K</span>
          </span>
        </button>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-px px-1.5">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const soon = item.href === null;
          const content = (
            <>
              <span className="inline-flex items-center gap-2">
                <Icon size={14} className={active ? 'text-accent' : undefined} />
                {item.label}
              </span>
              {item.badge !== undefined
                ? (
                    <span className="rounded-1 bg-white/[0.04] px-1.5 py-px font-mono text-2xs text-fg-3">
                      {item.badge}
                    </span>
                  )
                : soon
                  ? (
                      <span className="rounded-1 px-1.5 py-px font-mono text-2xs uppercase tracking-wide text-fg-4">
                        soon
                      </span>
                    )
                  : null}
            </>
          );
          const base = 'flex items-center justify-between gap-2 rounded-2 px-2 py-1.5 text-[12.5px] font-medium';
          if (soon) {
            return (
              <span
                key={item.id}
                aria-disabled
                title="Coming soon"
                className={cn(base, 'cursor-not-allowed text-fg-4')}
              >
                {content}
              </span>
            );
          }
          return (
            <Link
              key={item.id}
              href={item.href as string}
              className={cn(
                base,
                active ? 'bg-surface-3 text-fg-0' : 'text-fg-2 hover:bg-surface-2',
              )}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      {/* Pinned projects */}
      <div className="flex items-center justify-between px-3.5 pb-1.5 pt-4">
        <span className="font-sans text-2xs font-semibold uppercase tracking-wider text-fg-3">
          Pinned projects
        </span>
      </div>
      <div className="flex flex-col gap-px overflow-y-auto px-1.5">
        {projects.map((p) => {
          const active = pathname.startsWith(`/projects/${p.slug}`);
          return (
            <Link
              key={p.id}
              href={`/projects/${p.slug}`}
              className={cn(
                'flex items-center gap-2 rounded-2 px-2 py-1.5 text-xs font-medium',
                active ? 'bg-surface-3 text-fg-0' : 'text-fg-2 hover:bg-surface-2',
              )}
            >
              <span className="min-w-[32px] font-mono text-2xs text-fg-3">{projectCode(p.slug)}</span>
              <span className="flex-1 truncate">{p.name}</span>
            </Link>
          );
        })}
        {projects.length === 0 && (
          <span className="px-2 py-1.5 text-2xs text-fg-4">No projects yet</span>
        )}
      </div>

      <div className="flex-1" />

      {/* User block — account identity, role, and sign out (BK-86). The menu is
          a Radix DropdownMenu so it gets the full ARIA contract for free:
          role="menu"/menuitem, aria-haspopup/aria-expanded on the trigger,
          focus-trap, arrow-key nav, Escape-to-close, and focus-return. */}
      <div className="border-t border-stroke-1 px-3 py-2.5">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              data-testid="account-menu-trigger"
              title={email || 'Account'}
              className="flex w-full items-center gap-2 rounded-2 px-1 py-1 text-left hover:bg-surface-2"
            >
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-1 bg-gradient-to-br from-[#d9543f] to-[#b73a28] text-xs font-bold text-white">
                {userInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-fg-0">{email || 'Account'}</span>
                <span className="block text-2xs text-fg-3">
                  {hasWorkspaceRole ? roleText : 'Signed in'}
                </span>
              </span>
              <MoreHorizontal size={14} className="shrink-0 text-fg-3" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="start"
              sideOffset={6}
              data-testid="account-menu"
              className="z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-3 border border-stroke-2 bg-surface-1 p-2 shadow-pop"
            >
              <DropdownMenu.Label className="px-2 py-1">
                <span className="block font-mono text-2xs font-semibold uppercase tracking-widest text-fg-4">
                  Signed in as
                </span>
                <span className="mt-0.5 block truncate text-sm text-fg-1" title={email}>
                  {email || '—'}
                </span>
                <span className="mt-0.5 block text-2xs text-fg-3">
                  {hasWorkspaceRole ? roleText : NO_WORKSPACE_LABEL}
                </span>
              </DropdownMenu.Label>
              <DropdownMenu.Separator className="my-1 h-px bg-stroke-2" />
              <DropdownMenu.Item
                data-testid="account-sign-out"
                disabled={busy}
                onSelect={(e) => { e.preventDefault(); void handleSignOut(); }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-2 px-2 py-1.5 text-sm text-fg-1 outline-none data-[highlighted]:bg-surface-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
              >
                <LogOut size={14} className="text-fg-3" />
                {busy ? 'Signing out…' : 'Sign out'}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Global command palette: the sidebar owns the ⌘K hotkey (single owner).
          Driven by the search button above; other triggers pass ownsHotkey={false}. */}
      <CommandPalette trigger={false} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </aside>
  );
}
