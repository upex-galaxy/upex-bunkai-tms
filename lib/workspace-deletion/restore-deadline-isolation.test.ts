import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';

// BK-1735: a deleted workspace can be restored only while its 30-day deadline is
// still in the future, whether or not the daily purge has run (BK-512 AC-07,
// migration 0125). Against the real database: a mocked rpc proves nothing about a
// DEFINER function (ADR-0012).
//
// The elapsed time is simulated by backdating `deleted_at` with the service role,
// the same test-data move QA used to find the defect. The restore itself is called
// as the signed-in QA identity, through the same RPC the restore route calls.
//
// Fixtures live in throwaway workspaces named with PREFIX and are deleted in
// afterAll, which fails the suite if any remains. With no database environment the
// suite is skipped with a loud warning; in every other case it FAILS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[restore-deadline-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}
const describeOrSkip = hasDbEnv ? describe : describe.skip;
const PREFIX = `bk1735-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DAY_MS = 24 * 60 * 60 * 1000;

setDefaultTimeout(30_000);

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[restore-deadline-isolation] fixture step failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

let qa: SupabaseClient;
let qaUserId: string | null = null;
let counter = 0;
const workspaceIds: string[] = [];

function needUser(): string {
  if (!qaUserId) {
    throw new Error('[restore-deadline-isolation] the QA identity was not signed in (see the beforeAll failure above); refusing to pass.');
  }
  return qaUserId;
}

// A workspace the QA identity holds with `role`, soft-deleted `ageMs` ago.
async function seedDeletedWorkspace(role: 'owner' | 'viewer', ageMs: number): Promise<string> {
  const userId = needUser();
  counter += 1;
  const db = service();
  const ws = must(await db.from('workspaces').insert({
    slug: `${PREFIX}-${counter}`,
    name: `${PREFIX} ${counter}`,
    owner_user_id: userId,
  }).select('id').single(), 'workspace');
  workspaceIds.push(ws.id as string);
  must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role, status: 'active' }).select('user_id').single(), 'membership');
  must(await db.from('workspaces').update({
    deleted_at: new Date(Date.now() - ageMs).toISOString(),
    deletion_requested_by: userId,
  }).eq('id', ws.id).select('id').single(), 'backdate deleted_at');
  return ws.id as string;
}

async function deletedAtOf(workspaceId: string): Promise<string | null> {
  const row = must(await service().from('workspaces').select('deleted_at').eq('id', workspaceId).single(), 'read workspace');
  return (row as { deleted_at: string | null }).deleted_at;
}

async function restore(workspaceId: string) {
  return qa.rpc('bunkai_restore_workspace_deletion', { p_workspace_id: workspaceId });
}

describeOrSkip('bunkai_restore_workspace_deletion: the 30-day deadline (BK-1735)', () => {
  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[restore-deadline-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[restore-deadline-isolation] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    qaUserId = signIn.user.id;
  });

  afterAll(async () => {
    const db = service();
    if (workspaceIds.length > 0) {
      await db.from('workspace_members').delete().in('workspace_id', workspaceIds);
      await db.from('workspaces').delete().in('id', workspaceIds);
    }
    await qa?.auth.signOut();
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[restore-deadline-isolation] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  it('restores a workspace deleted 29 days ago', async () => {
    const id = await seedDeletedWorkspace('owner', 29 * DAY_MS);
    const { data, error } = await restore(id);
    expect(error).toBeNull();
    expect(data).toEqual({ workspace_id: id, workspace_name: `${PREFIX} ${counter}` });
    expect(await deletedAtOf(id)).toBeNull();
  });

  it('still restores one minute before the deadline', async () => {
    const id = await seedDeletedWorkspace('owner', 30 * DAY_MS - 60_000);
    const { error } = await restore(id);
    expect(error).toBeNull();
    expect(await deletedAtOf(id)).toBeNull();
  });

  it('refuses a workspace deleted 31 days ago with restore_window_closed and leaves it deleted, even though the purge has not run', async () => {
    const id = await seedDeletedWorkspace('owner', 31 * DAY_MS);
    const before = await deletedAtOf(id);
    const { data, error } = await restore(id);
    expect(data).toBeNull();
    expect(error?.code).toBe('45903');
    expect(error?.message).toBe('restore_window_closed');
    expect(await deletedAtOf(id)).toBe(before);
  });

  it('keeps the owner check first: a non-owner past the deadline is told owner_only, not that the window closed', async () => {
    const id = await seedDeletedWorkspace('viewer', 31 * DAY_MS);
    const { error } = await restore(id);
    expect(error?.code).toBe('45900');
    expect(error?.message).toBe('owner_only');
  });
});
