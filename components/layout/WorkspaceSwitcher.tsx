'use client';

import type { Project, Workspace } from '@lib/types';
import { cn } from '@lib/utils';
import { Check, ChevronDown, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface WorkspaceSwitcherProps {
  workspace: Workspace
  project: Project
  className?: string
}

interface MeWorkspace {
  id: string
  slug: string
  name: string
}

interface MeResponse {
  workspaces: MeWorkspace[]
  active_workspace_id: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

export function WorkspaceSwitcher({ workspace, project, className }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || me) { return; }
    void fetch('/api/v1/me')
      .then(async (r) => {
        if (!r.ok) { return; }
        const body = (await r.json()) as MeResponse;
        setMe(body);
      })
      .catch(() => undefined);
  }, [open, me]);

  const switchTo = async (workspaceId: string) => {
    if (busy || workspaceId === me?.active_workspace_id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/me/active-workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        toast.error(body.error?.message ?? 'Could not switch workspace.');
        return;
      }
      toast.success('Workspace switched.');
      setOpen(false);
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

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-7 items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-2 text-sm text-fg-1 hover:border-stroke-3 hover:bg-surface-3"
      >
        <span className="font-jp text-md font-bold text-fg-0">分</span>
        <span className="text-fg-3">{workspace.name}</span>
        <span className="text-fg-4">/</span>
        <span className="font-semibold text-fg-0">{project.name}</span>
        <ChevronDown size={11} className="text-fg-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-10 w-[280px] rounded-3 border border-stroke-2 bg-surface-1 p-2 shadow-lg">
          <div className="px-2 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-fg-4">
            Switch workspace
          </div>
          <ul className="m-0 grid gap-0.5 p-0">
            {(me?.workspaces ?? []).map(w => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => { void switchTo(w.id); }}
                  className="flex w-full items-center justify-between rounded-2 px-2 py-1.5 text-sm text-fg-1 hover:bg-surface-2"
                >
                  <span className="truncate">{w.name}</span>
                  {w.id === me?.active_workspace_id && <Check size={14} className="text-accent" />}
                </button>
              </li>
            ))}
            {!me && <li className="px-2 py-1.5 text-xs text-fg-4">Loading…</li>}
          </ul>
          {me && me.active_workspace_id && (
            <Link
              href={`/workspaces/${me.active_workspace_id}/members`}
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center gap-2 rounded-2 border-t border-stroke-2 px-2 pt-2 text-xs text-fg-3 hover:text-fg-1"
            >
              <Users size={12} />
              Manage members & invites
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
