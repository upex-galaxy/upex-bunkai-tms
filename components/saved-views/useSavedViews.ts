'use client';

import type { ViewKind } from '@lib/saved-views/constants';
import type { SavedViewState } from '@lib/saved-views/state';
import type { SavedViewItem } from '@lib/saved-views/view-model';
import { SAVED_VIEW_COPY } from '@lib/saved-views/constants';
import { removeView, upsertView } from '@lib/saved-views/menu-state';
import { useCallback, useRef, useState } from 'react';

// BK-443 — the client side of `/api/v1/projects/{id}/saved-views`: the list for
// one surface plus the four mutations, kept in sync locally so a view saved,
// renamed or deleted shows up without a reload (AC 1.3).

export type SavedViewsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type MutationResult = { ok: true, item: SavedViewItem } | { ok: false, message: string };

interface ApiErrorBody {
  error?: { message?: string }
}

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true, data: T | null } | { ok: false, message: string }> {
  try {
    const response = await fetch(url, init);
    if (response.status === 204) { return { ok: true, data: null }; }
    const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
    if (!response.ok) {
      // Server copy is rendered VERBATIM — never rephrased client-side.
      return { ok: false, message: body.error?.message ?? SAVED_VIEW_COPY.unavailable };
    }
    return { ok: true, data: body };
  }
  catch {
    return { ok: false, message: SAVED_VIEW_COPY.unavailable };
  }
}

export function useSavedViews(projectId: string, kind: ViewKind) {
  const base = `/api/v1/projects/${projectId}/saved-views`;
  const [views, setViews] = useState<SavedViewItem[] | null>(null);
  const [status, setStatus] = useState<SavedViewsStatus>('idle');
  // Only the latest load may write: a slow earlier response must not overwrite
  // a newer list (or a view saved in between).
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    latestLoad.current += 1;
    const mine = latestLoad.current;
    setStatus(current => (current === 'ready' ? current : 'loading'));
    const result = await call<{ items: SavedViewItem[] }>(`${base}?view_kind=${kind}`);
    if (mine !== latestLoad.current) { return; }
    if (!result.ok || !result.data) {
      setStatus('error');
      return;
    }
    setViews(result.data.items);
    setStatus('ready');
  }, [base, kind]);

  const send = useCallback(async (url: string, method: 'POST' | 'PATCH', body: unknown): Promise<MutationResult> => {
    const result = await call<{ item: SavedViewItem }>(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!result.ok || !result.data) {
      return { ok: false, message: result.ok ? SAVED_VIEW_COPY.unavailable : result.message };
    }
    // Invalidate any in-flight load that started before this write.
    latestLoad.current += 1;
    setViews(current => upsertView(current ?? [], result.data!.item));
    setStatus('ready');
    return { ok: true, item: result.data.item };
  }, []);

  const create = useCallback(async (name: string, state: SavedViewState) => send(base, 'POST', { view_kind: kind, name, state }), [base, kind, send]);
  const rename = useCallback(async (id: string, name: string) => send(`${base}/${id}`, 'PATCH', { name }), [base, send]);
  const replaceState = useCallback(async (id: string, state: SavedViewState) => send(`${base}/${id}`, 'PATCH', { state }), [base, send]);

  const remove = useCallback(async (id: string): Promise<{ ok: true } | { ok: false, message: string }> => {
    const result = await call<unknown>(`${base}/${id}`, { method: 'DELETE' });
    if (!result.ok) { return result; }
    latestLoad.current += 1;
    setViews(current => removeView(current ?? [], id));
    return { ok: true };
  }, [base]);

  return { views, status, load, create, rename, replaceState, remove };
}
