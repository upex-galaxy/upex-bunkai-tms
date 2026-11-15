import type { ArchiveActionDeps } from '@lib/milestones/archive-action';
import type { MilestoneArchiveResult } from '@lib/milestones/archive-client';
import { runArchiveAction } from '@lib/milestones/archive-action';
import { setMilestoneArchived } from '@lib/milestones/archive-client';
import { afterEach, describe, expect, test } from 'bun:test';

// BK-1899 — AC-04 "A failed archive tells me what went wrong": the request
// contract (`setMilestoneArchived`, with `fetch` stubbed) and the one-click flow
// (`runArchiveAction`, with its effects recorded). A failure must say the
// Milestone was not archived, offer Try again, and refresh nothing, so the
// Milestone stays where it was.

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init)) as typeof fetch;
}

describe('setMilestoneArchived', () => {
  test('posts to the archive or restore route and reads `changed`', async () => {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      return Response.json({ milestone: { changed: true } });
    });
    expect(await setMilestoneArchived('m1', 'archive')).toEqual({ ok: true, changed: true });
    expect(await setMilestoneArchived('m1', 'restore')).toEqual({ ok: true, changed: true });
    expect(calls).toEqual(['POST /api/v1/milestones/m1/archive', 'POST /api/v1/milestones/m1/restore']);
  });

  test('a repeat answers changed false', async () => {
    stubFetch(async () => Response.json({ milestone: { changed: false } }));
    expect(await setMilestoneArchived('m1', 'archive')).toEqual({ ok: true, changed: false });
  });

  test('a server error carries its message, a 403 is flagged, a dropped connection is a network error', async () => {
    stubFetch(async () => Response.json({ error: { message: 'Database unavailable.' } }, { status: 500 }));
    expect(await setMilestoneArchived('m1', 'archive')).toEqual({ ok: false, forbidden: false, errorMessage: 'Database unavailable.' });

    stubFetch(async () => Response.json({ error: { message: 'No.' } }, { status: 403 }));
    expect(await setMilestoneArchived('m1', 'archive')).toEqual({ ok: false, forbidden: true, errorMessage: 'No.' });

    stubFetch(async () => { throw new TypeError('Failed to fetch'); });
    expect(await setMilestoneArchived('m1', 'archive')).toEqual({ ok: false, forbidden: false, errorMessage: 'Network error.' });
  });
});

interface Recorded {
  success: Array<{ message: string, action?: string }>
  error: Array<{ message: string, description?: string, action?: string }>
  pushes: string[]
  refreshes: number
}

function deps(result: MilestoneArchiveResult): { deps: ArchiveActionDeps, seen: Recorded, actions: Array<() => void> } {
  const seen: Recorded = { success: [], error: [], pushes: [], refreshes: 0 };
  const actions: Array<() => void> = [];
  return {
    seen,
    actions,
    deps: {
      request: async () => result,
      success: (message, options) => {
        seen.success.push({ message, action: options?.action?.label });
        if (options?.action) { actions.push(options.action.onClick); }
      },
      error: (message, options) => {
        seen.error.push({ message, description: options?.description, action: options?.action?.label });
        if (options?.action) { actions.push(options.action.onClick); }
      },
      push: (href) => { seen.pushes.push(href); },
      refresh: () => { seen.refreshes += 1; },
    },
  };
}

const ACTIVE = { milestoneId: 'm1', name: 'Release 1.0', archived: false, projectSlug: 'checkout' };
const ARCHIVED = { ...ACTIVE, archived: true };

describe('runArchiveAction', () => {
  test('a failed archive says nothing changed, offers Try again and refreshes nothing', async () => {
    const { deps: d, seen, actions } = deps({ ok: false, forbidden: false, errorMessage: 'Network error.' });
    let retried = 0;
    await runArchiveAction(ACTIVE, d, () => { retried += 1; });
    expect(seen.error).toEqual([{ message: 'Could not archive “Release 1.0”. Nothing changed.', description: 'Network error.', action: 'Try again' }]);
    expect(seen.success).toEqual([]);
    expect(seen.refreshes).toBe(0);
    actions[0]();
    expect(retried).toBe(1);
  });

  test('a refusal by role offers no retry', async () => {
    const { deps: d, seen } = deps({ ok: false, forbidden: true, errorMessage: 'No.' });
    await runArchiveAction(ACTIVE, d, () => {});
    expect(seen.error).toEqual([{ message: 'Archiving and restoring milestones require the member role or higher.', description: undefined, action: undefined }]);
    expect(seen.refreshes).toBe(0);
  });

  test('a successful archive names the Milestone, offers Show archived and refreshes', async () => {
    const { deps: d, seen, actions } = deps({ ok: true, changed: true });
    await runArchiveAction(ACTIVE, d, () => {});
    expect(seen.success).toEqual([{ message: 'Archived “Release 1.0”.', action: 'Show archived' }]);
    expect(seen.refreshes).toBe(1);
    actions[0]();
    expect(seen.pushes).toEqual(['/projects/checkout/milestones?archived=show']);
  });

  test('a repeat says the Milestone was already in that state instead of claiming the change', async () => {
    const archive = deps({ ok: true, changed: false });
    await runArchiveAction(ACTIVE, archive.deps, () => {});
    expect(archive.seen.success[0].message).toBe('“Release 1.0” was already archived.');
    const restore = deps({ ok: true, changed: false });
    await runArchiveAction(ARCHIVED, restore.deps, () => {});
    expect(restore.seen.success[0].message).toBe('“Release 1.0” is already active.');
  });

  test('a failed and a successful restore', async () => {
    const failed = deps({ ok: false, forbidden: false, errorMessage: 'Oops.' });
    await runArchiveAction(ARCHIVED, failed.deps, () => {});
    expect(failed.seen.error[0].message).toBe('Could not restore “Release 1.0”. Nothing changed.');
    const done = deps({ ok: true, changed: true });
    await runArchiveAction(ARCHIVED, done.deps, () => {});
    expect(done.seen.success).toEqual([{ message: 'Restored “Release 1.0”.', action: undefined }]);
  });
});
