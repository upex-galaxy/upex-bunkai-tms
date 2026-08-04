'use client';

import type { NotificationRpcRow } from '@app/api/v1/workspaces/[id]/notifications/response';
import type { RealtimeConnectionStatus } from '@lib/runs/realtime-run-channel';
import type { MemberRole } from '@lib/types';
import type { ComponentType } from 'react';
import { CommandPalette } from '@components/layout/CommandPalette';
import { NotificationsPanel } from '@components/notifications/NotificationsPanel';
import { useAuth } from '@components/providers/auth-context';
import { emailInitials } from '@lib/account/initials';
import { NO_WORKSPACE_LABEL, roleLabel } from '@lib/account/role-label';
import { resolveNotificationHref } from '@lib/notifications/entity-routes';
import { buildNotificationsChannelConfig } from '@lib/notifications/realtime-notifications-channel';
import { formatUnreadBadgeCount } from '@lib/notifications/view';
import { createRefetchScheduler, shouldReconcileOnStatusChange } from '@lib/runs/realtime-run-channel';
import { createClient } from '@lib/supabase/client';
import { cn } from '@lib/utils';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Activity,
  BarChart3,
  Bell,
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
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // BK-209 (Slice 3: UI) — server-fetched so the bell badge paints correct on
  // first load, matching how every other server-driven element here
  // (workspaces, projects, role) skips a client waterfall. Local state below
  // takes over from here (optimistic mark-read/mark-all + Realtime pushes).
  initialUnreadCount: number
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

interface NotificationsApiErrorBody {
  error?: { message?: string }
}

type NotificationsFetchResult
  = | { ok: true, items: NotificationRpcRow[], unreadCount: number }
    | { ok: false, message: string };

const NOTIFICATIONS_FALLBACK_ERROR = 'Could not load notifications.';

// Mirrors ActivityView's own module-level `fetchActivity` helper — a plain
// function, not a hook, since it has no state of its own beyond its args.
async function fetchNotificationsData(workspaceId: string): Promise<NotificationsFetchResult> {
  const response = await fetch(`/api/v1/workspaces/${workspaceId}/notifications`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as NotificationsApiErrorBody;
    return { ok: false, message: body.error?.message ?? NOTIFICATIONS_FALLBACK_ERROR };
  }
  const body = (await response.json()) as { items: NotificationRpcRow[], unread_count: number };
  return { ok: true, items: body.items, unreadCount: body.unread_count };
}

export function AppSidebar({ workspaces, activeWorkspaceId, projects, userEmail, userRole, initialUnreadCount }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  const [wsOpen, setWsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // BK-209 (Slice 3: UI) — notifications bell + panel state. `unreadCount`
  // seeds from the server prop, then is kept current by: (a) optimistic
  // updates on mark-one/mark-all, (b) the Realtime subscription below, and
  // (c) reconciling back to the server value whenever `initialUnreadCount`
  // changes (a fresh SSR read, e.g. after router.refresh()) — mirrors
  // RunnerView's `useEffect(() => setView(run), [run])` reconciliation.
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<NotificationRpcRow[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  // The list is fetched lazily, the first time the panel opens — not on
  // every page load — so a page view that never opens the bell costs
  // nothing beyond the one SSR-seeded count.
  const notifLoadedRef = useRef(false);
  // The panel is portaled to <body> (see the render below): <aside> is
  // `overflow-hidden` (root className above) so a 380px-wide panel anchored
  // via plain CSS `absolute left-full` gets silently clipped at the rail's
  // own 224px edge — caught during live-UI validation, not visible from
  // source alone. Position is computed from the bell's own bounding rect at
  // open time instead.
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const [notifPanelPosition, setNotifPanelPosition] = useState<{ top: number, left: number } | null>(null);
  // Monotonic ticket so an in-flight read (loadNotifications, or the
  // Realtime "reconcile on subscribe" refetch) can never clobber a FRESHER
  // state update that landed while it was still in flight — every read
  // captures the counter's value at start and discards its own result if
  // the counter has moved on by the time it resolves; every mutation
  // (mark-one/mark-all) bumps it right before applying its own update, so
  // any earlier, still-in-flight read is retroactively marked stale.
  const notifRequestSeqRef = useRef(0);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const nav: NavItem[] = [
    { id: 'home', icon: Home, label: 'Home', href: null },
    { id: 'activity', icon: Activity, label: 'Activity', href: '/activity' },
    { id: 'projects', icon: Folder, label: 'Projects', href: '/projects', badge: projects.length },
    { id: 'library', icon: Library, label: 'ATC Library', href: null },
    { id: 'runs', icon: Play, label: 'Test Runs', href: null },
    { id: 'bugs', icon: Bug, label: 'Bug Reports', href: null },
    { id: 'metrics', icon: BarChart3, label: 'Metrics', href: null },
    { id: 'settings', icon: Settings, label: 'Settings', href: '/settings' },
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

  // BK-209 — same Escape-to-close idiom, for the notifications panel.
  useEffect(() => {
    if (!notifOpen) { return; }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setNotifOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifOpen]);

  // Reconcile the local badge count with a fresh server read (mount, or any
  // router.refresh() that re-runs AppLayout's getShellData()).
  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  // A workspace switch invalidates whatever notification list/state was
  // loaded for the PREVIOUS workspace — reset so a reopen fetches fresh
  // rather than showing another workspace's items.
  useEffect(() => {
    notifLoadedRef.current = false;
    setNotifications([]);
    setNotifError(null);
    setNotifOpen(false);
  }, [activeWorkspaceId]);

  const loadNotifications = async () => {
    if (!activeWorkspaceId) { return; }
    setNotifLoading(true);
    setNotifError(null);
    const seq = ++notifRequestSeqRef.current;
    const result = await fetchNotificationsData(activeWorkspaceId);
    setNotifLoading(false);
    // A newer read (a later loadNotifications/realtime-refetch call, or a
    // mark-one/mark-all mutation's own optimistic apply) has already landed
    // — this response is stale, discard the DATA (but the loading flag
    // above still clears) rather than clobber fresher state (caught during
    // live-UI validation: a same-tab mark-read could lose to an in-flight
    // realtime "reconcile on subscribe" refetch that started earlier but
    // resolved later).
    if (seq !== notifRequestSeqRef.current) { return; }
    if (result.ok) {
      setNotifications(result.items);
      setUnreadCount(result.unreadCount);
      notifLoadedRef.current = true;
    }
    else {
      setNotifError(result.message);
    }
  };

  const toggleNotifications = () => {
    if (notifOpen) {
      setNotifOpen(false);
      return;
    }
    const rect = bellButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setNotifPanelPosition({ top: rect.bottom + 8, left: rect.left });
    }
    setNotifOpen(true);
    if (!notifLoadedRef.current) {
      void loadNotifications();
    }
  };

  // BK-209 / ADR-0010 (RT-2 pattern reuse) — Realtime subscription: new
  // notifications and read-state changes update the badge (always) and the
  // visible list (when the panel happens to be open) without a manual
  // refresh. Scoped to `[activeWorkspaceId]`, mirroring RunnerView's
  // `[view.id]` scoping — a workspace switch tears down the old channel and
  // opens a new one for the newly active workspace.
  const prevRealtimeStatusRef = useRef<RealtimeConnectionStatus | null>(null);
  useEffect(() => {
    if (!activeWorkspaceId) { return; }

    const supabase = createClient();
    const config = buildNotificationsChannelConfig(activeWorkspaceId);
    prevRealtimeStatusRef.current = null;

    const refetch = async () => {
      const seq = ++notifRequestSeqRef.current;
      const result = await fetchNotificationsData(activeWorkspaceId);
      // Superseded by a newer read or a mutation's own optimistic apply —
      // discard rather than clobber fresher state (see loadNotifications).
      if (seq !== notifRequestSeqRef.current) { return; }
      if (result.ok) {
        setNotifications(result.items);
        setUnreadCount(result.unreadCount);
        notifLoadedRef.current = true;
      }
      // Silent on failure — mirrors RunnerView's realtime refetch: a
      // transient blip just means the next event or reconnect retries via
      // this same path.
    };

    const scheduler = createRefetchScheduler(() => { void refetch(); });

    const channel = supabase.channel(config.channelName);
    for (const binding of config.bindings) {
      channel.on<Record<string, unknown>>(
        'postgres_changes',
        { event: binding.event, schema: binding.schema, table: binding.table, filter: binding.filter },
        () => scheduler.trigger(),
      );
    }
    channel.subscribe((status) => {
      const next = String(status) as RealtimeConnectionStatus;
      if (shouldReconcileOnStatusChange(prevRealtimeStatusRef.current, next)) {
        scheduler.trigger();
      }
      prevRealtimeStatusRef.current = next;
    });

    return () => {
      scheduler.cancel();
      void supabase.removeChannel(channel);
    };
  }, [activeWorkspaceId]);

  const markOneRead = async (notification: NotificationRpcRow) => {
    if (notification.read_at !== null || markingIds.has(notification.id)) { return; }
    setMarkingIds(prev => new Set(prev).add(notification.id));
    try {
      const response = await fetch(`/api/v1/notifications/${notification.id}/read`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as NotificationsApiErrorBody;
        toast.error(body.error?.message ?? 'Could not mark this notification as read.');
        return;
      }
      const body = (await response.json()) as { notification: { id: string, read_at: string } };
      // Bump BEFORE applying — retroactively marks any earlier, still-in-
      // flight read (e.g. the Realtime "reconcile on subscribe" refetch) as
      // stale, so it can't clobber this fresher update when it resolves.
      notifRequestSeqRef.current += 1;
      setNotifications(prev => prev.map(n => (n.id === notification.id ? { ...n, read_at: body.notification.read_at } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
    }
  };

  const markAllRead = async () => {
    if (!activeWorkspaceId || markingAll || unreadCount === 0) { return; }
    setMarkingAll(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/notifications/read-all`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as NotificationsApiErrorBody;
        toast.error(body.error?.message ?? 'Could not mark all notifications as read.');
        return;
      }
      const nowIso = new Date().toISOString();
      notifRequestSeqRef.current += 1;
      setNotifications(prev => prev.map(n => (n.read_at === null ? { ...n, read_at: nowIso } : n)));
      setUnreadCount(0);
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setMarkingAll(false);
    }
  };

  // AC4/AC5 — click marks read (idempotent no-op if already read) and, only
  // when a route actually resolves (entity_available AND the payload
  // carries enough to build one — see lib/notifications/entity-routes.ts),
  // navigates and closes the panel (business-rules.md design intent: "Row
  // click closes because it navigates"). Otherwise the panel stays open and
  // the row's own unavailable note (already visible, not click-gated) is the
  // whole story.
  const handleRowActivate = (notification: NotificationRpcRow) => {
    if (notification.read_at === null) {
      void markOneRead(notification);
    }
    const href = resolveNotificationHref(notification);
    if (href !== null) {
      setNotifOpen(false);
      router.push(href);
    }
  };

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
      {/* Logo + Notifications bell + New */}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-3.5">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-1 bg-accent font-jp text-base font-bold leading-none tracking-tight text-white">
            分
          </span>
          <span className="text-base font-bold tracking-tight text-fg-0">Bunkai</span>
        </span>
        <span className="inline-flex items-center gap-1">
          {/* BK-209 — bell entry point (§5 D17: sidebar, not the mockup's
              topbar — the app's actual persistent global shell is this rail,
              not a topbar; see master-design-plan.md §5). Placed beside the
              "New project" affordance at the very top of the rail, the
              closest live equivalent to the mockup's "next to search, in the
              topbar" placement. */}
          <div className="relative">
            <button
              ref={bellButtonRef}
              type="button"
              data-testid="notifications_bell"
              aria-haspopup="true"
              aria-expanded={notifOpen}
              aria-controls="notifications-panel"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications, all read'}
              onClick={toggleNotifications}
              className="relative inline-flex size-6 items-center justify-center rounded-2 text-fg-3 hover:bg-surface-2 hover:text-fg-1"
            >
              <Bell size={14} />
              {unreadCount > 0 && (
                <span
                  data-testid="notifications_badge"
                  className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-2 border-surface-1 bg-accent px-1 font-mono text-[10px] font-semibold leading-none text-white"
                >
                  {formatUnreadBadgeCount(unreadCount)}
                </span>
              )}
            </button>

            {/* Portaled to <body> — <aside> is `overflow-hidden` (root
                className above), which would silently clip a 380px-wide panel
                anchored via plain in-flow CSS at the rail's own 224px edge
                (caught during live-UI validation). Positioned from the
                bell's own bounding rect, computed in toggleNotifications. */}
            {notifOpen && notifPanelPosition && createPortal(
              <>
                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setNotifOpen(false)} />
                <div
                  id="notifications-panel"
                  className="fixed z-50"
                  style={{ top: notifPanelPosition.top, left: notifPanelPosition.left }}
                >
                  <NotificationsPanel
                    items={notifications}
                    unreadCount={unreadCount}
                    loading={notifLoading}
                    error={notifError}
                    markingAll={markingAll}
                    markingIds={markingIds}
                    onRetry={() => { void loadNotifications(); }}
                    onMarkAllRead={() => { void markAllRead(); }}
                    onRowActivate={handleRowActivate}
                    onMarkOneRead={(notification) => { void markOneRead(notification); }}
                  />
                </div>
              </>,
              document.body,
            )}
          </div>
          <Link
            href="/projects/new"
            title="New project"
            className="inline-flex size-6 items-center justify-center rounded-2 text-fg-3 hover:bg-surface-2 hover:text-fg-1"
          >
            <Plus size={14} />
          </Link>
        </span>
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
              <DropdownMenu.Item asChild>
                <Link
                  href="/settings"
                  data-testid="account-menu-settings"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-2 px-2 py-1.5 text-sm text-fg-1 outline-none data-[highlighted]:bg-surface-2"
                >
                  <Settings size={14} className="text-fg-3" />
                  Settings
                </Link>
              </DropdownMenu.Item>
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
