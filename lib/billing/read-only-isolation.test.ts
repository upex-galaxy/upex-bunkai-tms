import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-233: migration 0140 against the REAL database. Every row carries PREFIX, beforeAll throws on a missing
// precondition, afterAll deletes everything and asserts a zero count. No Stripe call: the RPC receives the
// arguments the webhook route would pass.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const PREFIX = `bk233-read-only-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUSTOMER = `${PREFIX}-cus`;
const SUBSCRIPTION = `${PREFIX}-sub`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function qaSession() {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
  if (error) {
    throw new Error(`[read-only-isolation] QA_E2E login failed: ${error.message}`);
  }
  return client;
}

let qa: Awaited<ReturnType<typeof qaSession>>;
let cloudWs = '';
let enterpriseWs = '';
let projectIds: string[] = [];
let testId = '';
let atcId = '';
let counter = 0;
const eventId = (label: string) => `${PREFIX}-evt-${label}-${(counter += 1)}`;

async function makeWorkspace(qaUserId: string, suffix: string, plan: string, projects: number): Promise<{ id: string, projectIds: string[] }> {
  const db = service();
  const { data, error } = await db
    .from('workspaces')
    .insert({ slug: `${PREFIX}-${suffix}`, name: `${PREFIX}-${suffix}`, owner_user_id: qaUserId, plan })
    .select('id')
    .single();
  if (error) { throw error; }
  const { error: memberError } = await db.from('workspace_members').insert({ workspace_id: data.id, user_id: qaUserId, role: 'owner', status: 'active' });
  if (memberError) { throw memberError; }
  const ids: string[] = [];
  for (let i = 1; i <= projects; i += 1) {
    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: data.id, slug: `${PREFIX}-${suffix}-p${i}`, name: `P${i}`, created_at: new Date(Date.UTC(2026, 0, i)).toISOString() })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    ids.push(project.id);
  }
  return { id: data.id, projectIds: ids };
}

async function readOnlyIds(workspaceId: string): Promise<string[]> {
  const { data, error } = await qa.rpc('bunkai_read_only_project_ids', { p_workspace_id: workspaceId });
  expect(error).toBeNull();
  return (data ?? []) as string[];
}

function applyEvent(type: 'customer.subscription.updated' | 'customer.subscription.deleted', args: { id?: string | null, created?: string, cancel?: boolean, periodEnd?: string | null, subscription?: string } = {}) {
  return service().rpc('bunkai_apply_billing_subscription_event', {
    p_stripe_event_id: (args.id === undefined ? eventId(type) : args.id) as string,
    p_event_type: type,
    p_event_created: args.created ?? new Date().toISOString(),
    p_stripe_customer_id: CUSTOMER,
    p_stripe_subscription_id: args.subscription ?? SUBSCRIPTION,
    p_cancel_at_period_end: args.cancel ?? false,
    p_current_period_end: (args.periodEnd ?? null) as string,
  });
}

describeOrSkip('BK-233 - read-only over-limit projects and the subscription RPC (migration 0140)', () => {
  beforeAll(async () => {
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[read-only-isolation] precondition not met - need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
    }
    qa = await qaSession();
    const { data: user } = await qa.auth.getUser();
    const qaUserId = user.user?.id;
    if (!qaUserId) {
      throw new Error('[read-only-isolation] precondition not met - QA_E2E login returned no user id.');
    }
    const cloud = await makeWorkspace(qaUserId, 'cloud', 'cloud', 5);
    cloudWs = cloud.id;
    projectIds = cloud.projectIds;
    enterpriseWs = (await makeWorkspace(qaUserId, 'ent', 'enterprise', 6)).id;
    const { error } = await service().from('workspace_billing_state').insert({ workspace_id: cloudWs, stripe_customer_id: CUSTOMER, stripe_subscription_id: SUBSCRIPTION });
    if (error) { throw error; }

    const db = service();
    const { data: mod, error: moduleError } = await db.from('modules').insert({ project_id: projectIds[0], path: `${PREFIX}-m`, name: 'M1' }).select('id').single();
    if (moduleError) { throw moduleError; }
    const { data: story, error: storyError } = await db.from('user_stories').insert({ module_id: mod.id, project_id: projectIds[0], title: `${PREFIX} story` }).select('id').single();
    if (storyError) { throw storyError; }
    const { data: atc, error: atcError } = await db.from('atcs').insert({ project_id: projectIds[0], module_id: mod.id, user_story_id: story.id, slug: `${PREFIX}-atc`, title: `${PREFIX} atc`, layer: 'UI' }).select('id').single();
    if (atcError) { throw atcError; }
    atcId = atc.id;
    const { data: test, error: testError } = await db.from('tests').insert({ workspace_id: cloudWs, title: `${PREFIX} test`, created_by: qaUserId }).select('id').single();
    if (testError) { throw testError; }
    testId = test.id;
    const { error: stepError } = await db.from('test_steps').insert({ test_id: testId, atc_id: atcId, position: 1 });
    if (stepError) { throw stepError; }
  }, 60_000);

  afterAll(async () => {
    const db = service();
    const ids = [cloudWs, enterpriseWs].filter(Boolean);
    await db.from('stripe_webhook_events').delete().like('id', `${PREFIX}%`);
    await db.from('activity_log').delete().in('workspace_id', ids);
    await db.from('project_environments').delete().in('project_id', projectIds);
    if (testId) {
      await db.from('test_steps').delete().eq('test_id', testId);
      await db.from('test_automation_status_history').delete().eq('test_id', testId);
      await db.from('tests').delete().eq('id', testId);
    }
    await db.from('atcs').delete().in('project_id', projectIds);
    await db.from('user_stories').delete().in('project_id', projectIds);
    await db.from('modules').delete().in('project_id', projectIds);
    await db.from('projects').delete().in('workspace_id', ids);
    await db.from('workspace_members').delete().in('workspace_id', ids);
    await db.from('workspaces').delete().in('id', ids);
    const left = await Promise.all([
      db.from('workspaces').select('id', { count: 'exact', head: true }).in('id', ids),
      db.from('projects').select('id', { count: 'exact', head: true }).in('workspace_id', ids),
      db.from('stripe_webhook_events').select('id', { count: 'exact', head: true }).like('id', `${PREFIX}%`),
    ]);
    const counts = left.map(r => r.count);
    if (counts.some(c => c !== 0)) {
      throw new Error(`[read-only-isolation] fixtures left behind (workspaces, projects, events): ${counts.join(', ')}`);
    }
  }, 60_000);

  it('locks nothing in a workspace within its plan: Cloud with 5 projects stays editable', async () => {
    expect(await readOnlyIds(cloudWs)).toEqual([]);
    const { error } = await qa.from('projects').update({ description: `${PREFIX} edit` }).eq('id', projectIds[0]);
    expect(error).toBeNull();
  });

  it('never locks an unlimited Enterprise workspace with 6 projects', async () => {
    expect(await readOnlyIds(enterpriseWs)).toEqual([]);
  });

  it('a signed-in user cannot call the subscription RPC', async () => {
    const { error } = await qa.rpc('bunkai_apply_billing_subscription_event', {
      p_stripe_event_id: eventId('forged'),
      p_event_type: 'customer.subscription.deleted',
      p_event_created: new Date().toISOString(),
      p_stripe_customer_id: CUSTOMER,
      p_stripe_subscription_id: SUBSCRIPTION,
      p_cancel_at_period_end: false,
      p_current_period_end: null as unknown as string,
    });
    expect(error).not.toBeNull();
  });

  it('records a scheduled cancellation and ignores an older out-of-order event (Scenario 3.1)', async () => {
    const { data } = await applyEvent('customer.subscription.updated', { cancel: true, periodEnd: '2026-12-31T00:00:00Z', created: '2026-12-10T00:00:00Z' });
    expect((data as { status: string }).status).toBe('cancel_scheduled');
    const stale = await applyEvent('customer.subscription.updated', { cancel: false, created: '2026-12-09T00:00:00Z' });
    expect((stale.data as { status: string }).status).toBe('stale');
    const { data: state } = await service().from('workspace_billing_state').select('cancel_at_period_end, current_period_end').eq('workspace_id', cloudWs).single();
    expect(state?.cancel_at_period_end).toBe(true);
    expect(new Date(state!.current_period_end as string).toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(await readOnlyIds(cloudWs)).toEqual([]);
  });

  it('reverts the cancellation on resubscribe (Scenario 4.1)', async () => {
    const { data } = await applyEvent('customer.subscription.updated', { cancel: false, periodEnd: '2026-12-31T00:00:00Z', created: '2026-12-20T00:00:00Z' });
    expect((data as { status: string }).status).toBe('resumed');
  });

  it('processes a duplicated webhook once (Scenario E2)', async () => {
    const id = eventId('dup');
    const first = await applyEvent('customer.subscription.updated', { id, cancel: false, created: '2026-12-21T00:00:00Z' });
    const second = await applyEvent('customer.subscription.updated', { id, cancel: false, created: '2026-12-21T00:00:00Z' });
    expect((first.data as { status: string }).status).not.toBe('duplicate');
    expect((second.data as { status: string }).status).toBe('duplicate');
  });

  it('ignores an event for another subscription', async () => {
    const { data } = await applyEvent('customer.subscription.deleted', { subscription: `${PREFIX}-other` });
    expect((data as { status: string }).status).toBe('ignored');
  });

  it('drops to Community at the end and makes the two oldest projects read-only, deleting nothing (Scenarios 2.1, 3.2)', async () => {
    const { data } = await applyEvent('customer.subscription.deleted', { created: '2027-01-01T00:00:00Z' });
    expect(data).toMatchObject({ status: 'downgraded', read_only_projects: 2 });
    const { data: ws } = await service().from('workspaces').select('plan, purchased_seats').eq('id', cloudWs).single();
    expect(ws).toEqual({ plan: 'community', purchased_seats: null });
    expect(await readOnlyIds(cloudWs)).toEqual([projectIds[0], projectIds[1]]);
    const { count } = await qa.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', cloudWs);
    expect(count).toBe(5);
  });

  it('refuses a write to a read-only project with 45701 and allows the editable ones (Scenario 2.2)', async () => {
    const locked = await qa.from('projects').update({ description: `${PREFIX} blocked` }).eq('id', projectIds[0]);
    expect(locked.error?.code).toBe('45701');
    const child = await service().from('project_environments').insert({ project_id: projectIds[1], name: `${PREFIX}-env` });
    expect(child.error?.code).toBe('45701');
    const editable = await qa.from('projects').update({ description: `${PREFIX} ok` }).eq('id', projectIds[2]);
    expect(editable.error).toBeNull();
    const env = await service().from('project_environments').insert({ project_id: projectIds[4], name: `${PREFIX}-env` });
    expect(env.error).toBeNull();
  });

  it('locks a Test chained to a read-only project, and its steps', async () => {
    const renamed = await service().from('tests').update({ title: `${PREFIX} renamed` }).eq('id', testId);
    expect(renamed.error?.code).toBe('45701');
    const step = await service().from('test_steps').insert({ test_id: testId, atc_id: atcId, position: 2 });
    expect(step.error?.code).toBe('45701');
    const atc = await service().from('atcs').update({ title: `${PREFIX} atc edited` }).eq('id', atcId);
    expect(atc.error?.code).toBe('45701');
  });

  it('a second deleted event after the downgrade is ignored, never re-applied', async () => {
    const { data } = await applyEvent('customer.subscription.deleted');
    expect((data as { status: string }).status).toBe('ignored');
  });

  it('restores editing at once after a re-upgrade (Scenario 2.3)', async () => {
    const { error } = await service().from('workspaces').update({ plan: 'cloud' }).eq('id', cloudWs);
    expect(error).toBeNull();
    expect(await readOnlyIds(cloudWs)).toEqual([]);
    const thawed = await qa.from('projects').update({ description: `${PREFIX} thawed` }).eq('id', projectIds[0]);
    expect(thawed.error).toBeNull();
    const test = await service().from('tests').update({ title: `${PREFIX} thawed` }).eq('id', testId);
    expect(test.error).toBeNull();
  });
});
