import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-718 — the tenancy boundary of defect Realtime events, proven through
// REAL signed-in sessions (the AI Tech Lead ruling on the ticket requires AC-5
// to be verified live, not reasoned about). Migration 0133 puts `bugs` in the
// database-global `supabase_realtime` publication; the only scoping is the
// subscriber's own read policy (`bugs_select_workspace_member`, 0046).
//
// Fixture: a member of workspace A and an outsider who belongs only to
// workspace B ("Globex"). Workspace A holds the watched Project and a second
// Project. A defect is filed in the watched Project through the REAL write
// RPC (`bunkai_create_bug`, the function POST /api/v1/bugs calls).
//
// Positive control FIRST: the member's Project-filtered subscription must
// receive the INSERT, or every "nothing reached the outsider" assertion would
// pass trivially (for example before 0133 is applied, when nothing
// replicates). Then: the outsider receives nothing on an unfiltered `bugs`
// subscription nor on one filtered to the watched Project, and the member's
// subscription to the other Project of the same workspace receives nothing.
//
// Shared-DB, env-gated, run in isolation. Creates two throwaway users and two
// workspaces and removes them in afterAll; the defect goes with workspace A.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeOrSkip = url && anonKey && serviceKey ? describe : describe.skip;

const PREFIX = `bk718-heatmap-rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;
const BOUND_MS = 5000;
// After the member has the event, how long the negative probes keep
// listening. Delivery to a wrongly-authorised subscriber would arrive in the
// same few hundred milliseconds as the member's copy.
const NEGATIVE_WINDOW_MS = 4000;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function signedIn(email: string) {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) { throw new Error(`sign-in failed: ${error.message}`); }
  // Join as the signed-in user, never as anon (BK-1279).
  await client.realtime.setAuth();
  return client;
}

const sleep = async (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

interface Sink { events: Array<{ id: string, project_id: string, at: number }> }

async function listen(client: SupabaseClient, name: string, filter: string | undefined): Promise<{ channel: RealtimeChannel, sink: Sink }> {
  const sink: Sink = { events: [] };
  const channel = client.channel(`${PREFIX}-${name}`);
  channel.on<{ id: string, project_id: string }>(
    'postgres_changes',
    filter ? { event: 'INSERT', schema: 'public', table: 'bugs', filter } : { event: 'INSERT', schema: 'public', table: 'bugs' },
    (payload) => { sink.events.push({ id: payload.new.id, project_id: payload.new.project_id, at: Date.now() }); },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: no SUBSCRIBED within 15 s`)), 15_000);
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve({ channel, sink });
      }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`${name}: ${status} ${err?.message ?? ''}`));
      }
    });
  });
}

const users: Record<'member' | 'outsider', { id: string, email: string }> = {
  member: { id: '', email: `${PREFIX}-member@example.test` },
  outsider: { id: '', email: `${PREFIX}-outsider@example.test` },
};
const workspaceIds: string[] = [];
let watchedProjectId = '';
let otherProjectId = '';
let moduleId = '';
let member: SupabaseClient;
let outsider: SupabaseClient;

describeOrSkip('BK-718 — defect Realtime events reach workspace members only', () => {
  beforeAll(async () => {
    const admin = service();
    for (const key of Object.keys(users) as (keyof typeof users)[]) {
      const { data, error } = await admin.auth.admin.createUser({ email: users[key].email, password: PASSWORD, email_confirm: true });
      if (error || !data.user) { throw new Error(`createUser ${key}: ${error?.message}`); }
      users[key].id = data.user.id;
    }

    const { data: workspaces, error: wsError } = await admin
      .from('workspaces')
      .insert([
        { slug: `${PREFIX}-acme`, name: `${PREFIX} Acme`, owner_user_id: users.member.id },
        { slug: `${PREFIX}-globex`, name: `${PREFIX} Globex`, owner_user_id: users.outsider.id },
      ])
      .select('id, slug');
    if (wsError || !workspaces) { throw new Error(`workspaces: ${wsError?.message}`); }
    const acmeId = workspaces.find(w => (w.slug as string).endsWith('-acme'))!.id as string;
    const globexId = workspaces.find(w => (w.slug as string).endsWith('-globex'))!.id as string;
    workspaceIds.push(acmeId, globexId);

    const { error: memberError } = await admin.from('workspace_members').insert([
      { workspace_id: acmeId, user_id: users.member.id, role: 'owner', status: 'active' },
      { workspace_id: globexId, user_id: users.outsider.id, role: 'owner', status: 'active' },
    ]);
    if (memberError) { throw new Error(`members: ${memberError.message}`); }

    const { data: projects, error: projectError } = await admin
      .from('projects')
      .insert([
        { workspace_id: acmeId, slug: `${PREFIX}-checkout`, name: `${PREFIX} Checkout` },
        { workspace_id: acmeId, slug: `${PREFIX}-search`, name: `${PREFIX} Search` },
      ])
      .select('id, slug');
    if (projectError || !projects) { throw new Error(`projects: ${projectError?.message}`); }
    watchedProjectId = projects.find(p => (p.slug as string).endsWith('-checkout'))!.id as string;
    otherProjectId = projects.find(p => (p.slug as string).endsWith('-search'))!.id as string;

    const { data: modules, error: moduleError } = await admin
      .from('modules')
      .insert({ project_id: watchedProjectId, path: 'payments', name: 'Payments' })
      .select('id');
    if (moduleError || !modules) { throw new Error(`module: ${moduleError?.message}`); }
    moduleId = modules[0].id as string;

    member = await signedIn(users.member.email);
    outsider = await signedIn(users.outsider.email);
  }, 60_000);

  afterAll(async () => {
    const failures: string[] = [];
    for (const client of [member, outsider]) {
      if (client) { await client.removeAllChannels(); }
    }
    const admin = service();
    for (const id of workspaceIds) {
      const { error } = await admin.from('workspaces').delete().eq('id', id);
      if (error) { failures.push(`workspace ${id}: ${error.message}`); }
    }
    for (const u of Object.values(users)) {
      if (!u.id) { continue; }
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) { failures.push(`user ${u.email}: ${error.message}`); }
    }
    // Count leftovers back: no defect of this run may survive the cleanup.
    const { count, error: countError } = await admin
      .from('bugs')
      .select('id', { count: 'exact', head: true })
      .like('title', `${PREFIX}%`);
    if (countError) { failures.push(`leftover count: ${countError.message}`); }
    else if ((count ?? 0) > 0) { failures.push(`${count} defect(s) left behind`); }
    if (failures.length > 0) { throw new Error(`cleanup failed: ${failures.join('; ')}`); }
  }, 60_000);

  it('delivers a filed defect to a member within 5 s, and nothing to an outsider or to another Project\'s listener', async () => {
    const memberWatched = await listen(member, 'member-watched', `project_id=eq.${watchedProjectId}`);
    const memberOther = await listen(member, 'member-other-project', `project_id=eq.${otherProjectId}`);
    const outsiderAll = await listen(outsider, 'outsider-unfiltered', undefined);
    const outsiderWatched = await listen(outsider, 'outsider-watched', `project_id=eq.${watchedProjectId}`);
    // SUBSCRIBED can be reported a moment before the server has activated the
    // postgres_changes binding; a short settle keeps the positive control
    // from missing the event for that reason alone.
    await sleep(1500);

    const { data, error } = await service().rpc('bunkai_create_bug', {
      p_actor_user_id: users.member.id,
      p_project_id: watchedProjectId,
      p_module_id: moduleId,
      p_title: `${PREFIX} filed while watching`,
      p_severity: 'P2',
      p_description: null,
      p_steps_to_reproduce: '',
      p_evidence_urls: [],
      p_run_id: null,
      p_run_step_id: null,
      p_atc_id: null,
    });
    if (error) { throw error; }
    const filedAt = Date.now();
    const bugId = (data as { id: string }).id;

    // Positive control: the member's copy arrives inside the bound.
    while (memberWatched.sink.events.length === 0 && Date.now() - filedAt < BOUND_MS + 5000) {
      await sleep(50);
    }
    expect(memberWatched.sink.events.map(e => e.id)).toEqual([bugId]);
    const latencyMs = memberWatched.sink.events[0].at - filedAt;
    // Reported by the run (BK-718 asks for the measured figure, not a claim).
    console.info(`[BK-718] member received the INSERT ${latencyMs} ms after the filing RPC returned`);
    expect(latencyMs).toBeLessThanOrEqual(BOUND_MS);

    await sleep(NEGATIVE_WINDOW_MS);
    expect(outsiderAll.sink.events).toEqual([]);
    expect(outsiderWatched.sink.events).toEqual([]);
    expect(memberOther.sink.events).toEqual([]);
  }, 60_000);
});
