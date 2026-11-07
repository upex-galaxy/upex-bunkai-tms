import type { Database } from '@lib/types/supabase';
import { deleteWorkspaceJiraConnection, getWorkspaceJiraCredentials, upsertWorkspaceJiraConnection } from '@lib/supabase/rpc';
import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-1619 — the ADR-0012 / rpc-authorization.md section 5 DB-integration guard for
// the workspace Jira connection functions of migration 0119
// (`bunkai_upsert_workspace_jira_connection`, `bunkai_get_workspace_jira_credentials`,
// `bunkai_delete_workspace_jira_connection`). A mocked `db.rpc` proves nothing about
// grants, Vault or a cascade, so everything below reaches the REAL database through
// the SAME mechanism lib/tracker-settings/tracker-settings-isolation.test.ts uses:
//
//  (A) GRANT — a real `authenticated` session (the declared automation identity,
//      QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD) is refused with 42501 on all three
//      functions. The grant, not the body, refuses.
//
//  (B) BEHAVIOUR — service-role client with an EXPLICIT actor (the contract the
//      routes use) against a throwaway workspace seeded with service-role table
//      writes and removed in afterAll (the QA identity is the owner, its role is
//      toggled per case; no user is created): a plain member is refused 42501, a
//      non-member P0002; then upsert -> credentials readback -> token required when
//      the site changes (45422) -> delete, with the Vault secret counted by name
//      (direct Postgres, POSTGRES_URL) so a leaked or orphaned secret fails the
//      suite; and deleting the WORKSPACE cascades the secret away.
//
//  (C) AUDIT (migration 0120). A separate describe, skipped (with a loud SKIPPED
//      line) until migration 0120 is applied: the probe reads the live function
//      body. After the orchestrator applies 0120 it runs by itself; no edit needed.
//
// FAIL CLOSED. Only two conditions may skip, both decided once at module level:
// an incomplete environment, and migration 0119 not applied (PGRST202 / PGRST205 /
// 42883 / 42P01). Anything else FAILS. Block (B) and (C) also need POSTGRES_URL for
// the Vault count. Every test starts with `expect.hasAssertions()`.
//
// Only throwaway ids and fake tokens (`tok_test_*`) are used. A green run clears
// the pending-apply row only if the log shows zero `SKIPPED:` lines.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

const hasEnv = Boolean(url && anonKey && serviceKey && qaEmail && qaPassword);

const PREFIX = `bk1619-jira-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const NOBODY_WORKSPACE = '00000000-0000-0000-0000-000000001619';
const SITE_A = 'https://bk1619-a.atlassian.net';
const SITE_B = 'https://bk1619-b.atlassian.net';
const EMAIL_A = 'bk1619-a@example.test';
const EMAIL_B = 'bk1619-b@example.test';
const TOKEN_1 = 'tok_test_bk1619_one';
const TOKEN_2 = 'tok_test_bk1619_two';

type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Db = ReturnType<typeof service>;

interface RpcError { code?: string | null, message?: string | null }

function service() {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
}

// A precondition the suite needs but does not have is a FAILURE, never a skip.
function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Precondition failed: ${what}. This is a failure, not a skip.`);
  }
  return value;
}

const ABSENT = new Set(['PGRST202', '42883', 'PGRST205', '42P01']);

async function deploymentGap(db: Db): Promise<string | null> {
  const probe = await getWorkspaceJiraCredentials(db, NOBODY_WORKSPACE);
  if (probe.error) {
    if (probe.error.code && ABSENT.has(probe.error.code)) {
      return `bunkai_get_workspace_jira_credentials is not deployed yet (${probe.error.code}). Apply migration 0119_workspace_jira_connections.sql, then re-run this suite.`;
    }
    throw new Error(`Unexpected answer from the Jira connection deployment probe: ${probe.error.code ?? 'no code'} ${probe.error.message}`);
  }
  const table = await db.from('workspace_jira_connections').select('workspace_id').limit(1);
  if (table.error) {
    if (table.error.code && ABSENT.has(table.error.code)) {
      return `workspace_jira_connections is not deployed yet (${table.error.code}). Apply migration 0119_workspace_jira_connections.sql, then re-run this suite.`;
    }
    throw new Error(`Unexpected answer from the workspace_jira_connections probe: ${table.error.code ?? 'no code'} ${table.error.message}`);
  }
  return null;
}

// True once migration 0120 is live: the upsert body writes the audit row.
async function auditDeployed(): Promise<boolean> {
  const sql = new SQL(pgUrl!);
  try {
    const [row] = await sql`
      select pg_get_functiondef(p.oid) like '%jira_connection.connected%' as has_audit
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname = 'bunkai_upsert_workspace_jira_connection'`;
    return row?.has_audit === true;
  }
  finally {
    await sql.end();
  }
}

const skipWhy: string | null = !hasEnv
  ? 'a required environment variable is missing (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, QA_E2E_USER_EMAIL, QA_E2E_USER_PASSWORD).'
  : await deploymentGap(service());
const pgSkipWhy: string | null = skipWhy ?? (pgUrl ? null : 'POSTGRES_URL is missing, so the Vault count (blocks B and C) cannot run.');
const auditSkipWhy: string | null = pgSkipWhy ?? ((await auditDeployed()) ? null : 'migration 0120_workspace_jira_connection_activity.sql is not applied yet. Apply it, then re-run this suite.');
if (skipWhy) {
  console.warn(`SKIPPED: the whole BK-1619 Jira connection DB-integration suite did not run: ${skipWhy} It proves nothing until it runs with zero SKIPPED lines.`);
}
else if (pgSkipWhy) {
  console.warn(`SKIPPED: BK-1619 blocks (B) and (C) did not run: ${pgSkipWhy} It proves nothing until it runs with zero SKIPPED lines.`);
}
else if (auditSkipWhy) {
  console.warn(`SKIPPED: BK-1619 block (C), the audit rows, did not run: ${auditSkipWhy}`);
}
const describeDb = skipWhy ? describe.skip : describe;
const describePg = pgSkipWhy ? describe.skip : describe;
const describeAudit = auditSkipWhy ? describe.skip : describe;

// Every workspace this file creates, removed even when setup failed half way.
const trackedWorkspaces: string[] = [];

async function cleanupTracked(): Promise<void> {
  if (trackedWorkspaces.length === 0) { return; }
  const ids = trackedWorkspaces.splice(0, trackedWorkspaces.length);
  const { error } = await service().from('workspaces').delete().in('id', ids);
  if (error) {
    throw new Error(`Teardown failed, throwaway workspaces may be left behind (${ids.join(', ')}): ${error.message}`);
  }
}

async function signInQa() {
  const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
  if (error || !data.session || !data.user) {
    throw new Error(`Precondition failed: QA_E2E login failed (${error?.message ?? 'no session returned'}). This is a failure, not a skip.`);
  }
  return { client, userId: data.user.id };
}

async function seedWorkspace(db: Db, ownerUserId: string, label: string) {
  const { data, error } = await db
    .from('workspaces')
    .insert({ slug: `${PREFIX}-${label}`, name: `${PREFIX}-${label}`, owner_user_id: ownerUserId })
    .select('id')
    .single();
  if (error) { throw error; }
  trackedWorkspaces.push(data.id);
  return data.id;
}

async function setQaRole(db: Db, workspaceId: string, qaUserId: string, role: Role | null) {
  await db.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', qaUserId);
  if (role === null) { return; }
  const { error } = await db
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: qaUserId, role, status: 'active' });
  if (error) { throw error; }
}

describeDb('BK-1619 (A) — the Jira connection functions are unreachable from a real authenticated session', () => {
  let session: ReturnType<typeof createClient<Database>> | null = null;

  beforeAll(async () => {
    session = (await signInQa()).client;
  });

  afterAll(async () => {
    await session?.auth.signOut();
    session = null;
  });

  it('control: the session client is a genuine authenticated caller', async () => {
    expect.hasAssertions();
    need(session, 'the QA_E2E session');
    const { error } = await session!.rpc('bunkai_normalize_test_tags', { p_tags: ['Smoke'] });
    expect(error).toBeNull();
  });

  it('refuses bunkai_upsert_workspace_jira_connection with 42501, spoofed actor or own id', async () => {
    expect.hasAssertions();
    need(session, 'the QA_E2E session');
    const { data: userData } = await session!.auth.getUser();
    for (const actorUserId of [NOBODY_WORKSPACE, userData.user!.id]) {
      const { data, error } = await upsertWorkspaceJiraConnection(session!, {
        actorUserId,
        workspaceId: NOBODY_WORKSPACE,
        siteUrl: SITE_A,
        email: EMAIL_A,
        apiToken: TOKEN_1,
      });
      expect(data).toBeNull();
      expect((error as RpcError).code).toBe('42501');
      expect((error as RpcError).message ?? '').toMatch(/permission denied/i);
    }
  });

  it('refuses bunkai_get_workspace_jira_credentials with 42501: no client can read a token', async () => {
    expect.hasAssertions();
    need(session, 'the QA_E2E session');
    const { data, error } = await getWorkspaceJiraCredentials(session!, NOBODY_WORKSPACE);
    expect(data).toBeNull();
    expect((error as RpcError).code).toBe('42501');
  });

  it('refuses bunkai_delete_workspace_jira_connection with 42501', async () => {
    expect.hasAssertions();
    need(session, 'the QA_E2E session');
    const { data: userData } = await session!.auth.getUser();
    const { data, error } = await deleteWorkspaceJiraConnection(session!, {
      actorUserId: userData.user!.id,
      workspaceId: NOBODY_WORKSPACE,
    });
    expect(data).toBeNull();
    expect((error as RpcError).code).toBe('42501');
  });

  it('the table itself is closed to an authenticated session', async () => {
    expect.hasAssertions();
    need(session, 'the QA_E2E session');
    const { data, error } = await session!.from('workspace_jira_connections').select('workspace_id').limit(1);
    // No privilege at all: PostgREST answers 42501, never an empty list.
    expect(data).toBeNull();
    expect((error as RpcError).code).toBe('42501');
  });
});

describePg('BK-1619 (B) — upsert / readback / delete against the real database, Vault counted', () => {
  let sql: SQL | null = null;
  let workspaceId: string | null = null;
  let qaUserId: string | null = null;

  const secretName = () => `jira_ws_${need(workspaceId, 'the fixture workspace')}`;
  const secretCount = async (): Promise<number> => {
    const [row] = await need(sql, 'the direct Postgres connection')`select count(*)::int as n from vault.secrets where name = ${secretName()}`;
    return row.n as number;
  };
  const rowCount = async (): Promise<number> => {
    const { data, error } = await service().from('workspace_jira_connections').select('workspace_id').eq('workspace_id', need(workspaceId, 'the fixture workspace'));
    if (error) { throw error; }
    return data.length;
  };
  const save = async (args: { siteUrl: string, email: string, apiToken?: string | null }, actor?: string) => upsertWorkspaceJiraConnection(service(), {
    actorUserId: actor ?? need(qaUserId, 'the QA user'),
    workspaceId: need(workspaceId, 'the fixture workspace'),
    ...args,
  });
  const credentials = async () => {
    const { data, error } = await getWorkspaceJiraCredentials(service(), need(workspaceId, 'the fixture workspace'));
    if (error) { throw error; }
    return data as { site_url: string, email: string, token: string } | null;
  };

  beforeAll(async () => {
    const db = service();
    const { client, userId } = await signInQa();
    await client.auth.signOut();
    qaUserId = userId;
    workspaceId = await seedWorkspace(db, userId, 'ws');
    sql = new SQL(pgUrl!);
  }, 30_000);

  afterAll(async () => {
    try {
      await sql?.end();
    }
    finally {
      sql = null;
      await cleanupTracked();
    }
  });

  it('refuses a plain member and a viewer with 42501 and writes nothing', async () => {
    expect.hasAssertions();
    const db = service();
    const ws = need(workspaceId, 'the fixture workspace');
    for (const role of ['member', 'viewer'] as const) {
      await setQaRole(db, ws, need(qaUserId, 'the QA user'), role);
      const saved = await save({ siteUrl: SITE_A, email: EMAIL_A, apiToken: TOKEN_1 });
      expect(saved.data).toBeNull();
      expect(saved.error?.code).toBe('42501');
      const removed = await deleteWorkspaceJiraConnection(db, { actorUserId: need(qaUserId, 'the QA user'), workspaceId: ws });
      expect(removed.data).toBeNull();
      expect(removed.error?.code).toBe('42501');
    }
    expect(await rowCount()).toBe(0);
    expect(await secretCount()).toBe(0);
  });

  it('refuses a non-member with P0002, the same answer as a workspace that does not exist', async () => {
    expect.hasAssertions();
    const db = service();
    const ws = need(workspaceId, 'the fixture workspace');
    await setQaRole(db, ws, need(qaUserId, 'the QA user'), null);
    const outsider = await save({ siteUrl: SITE_A, email: EMAIL_A, apiToken: TOKEN_1 });
    const missing = await upsertWorkspaceJiraConnection(db, {
      actorUserId: need(qaUserId, 'the QA user'),
      workspaceId: NOBODY_WORKSPACE,
      siteUrl: SITE_A,
      email: EMAIL_A,
      apiToken: TOKEN_1,
    });
    const outsiderDelete = await deleteWorkspaceJiraConnection(db, { actorUserId: need(qaUserId, 'the QA user'), workspaceId: ws });
    for (const result of [outsider, missing, outsiderDelete]) {
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('P0002');
    }
    expect(await rowCount()).toBe(0);
    expect(await secretCount()).toBe(0);
  });

  it('upsert -> readback -> token rule -> delete leaves no orphan secret', async () => {
    expect.hasAssertions();
    const db = service();
    const ws = need(workspaceId, 'the fixture workspace');
    await setQaRole(db, ws, need(qaUserId, 'the QA user'), 'admin');
    const baseline = await secretCount();
    expect(baseline).toBe(0);
    expect(await credentials()).toBeNull();

    // First save needs a token.
    const noToken = await save({ siteUrl: SITE_A, email: EMAIL_A });
    expect(noToken.error?.code).toBe('45422');
    expect(await secretCount()).toBe(baseline);

    // Connect. The response carries no secret; the readback decrypts it.
    const first = await save({ siteUrl: `${SITE_A}/`, email: EMAIL_A, apiToken: TOKEN_1 });
    expect(first.error).toBeNull();
    expect(Object.keys(first.data as object).sort()).toEqual(['email', 'site_url', 'updated_at', 'updated_by']);
    expect(JSON.stringify(first.data)).not.toContain(TOKEN_1);
    expect(await secretCount()).toBe(baseline + 1);
    expect(await credentials()).toEqual({ site_url: SITE_A, email: EMAIL_A, token: TOKEN_1 });

    // Email-only change keeps the stored token.
    const emailOnly = await save({ siteUrl: SITE_A, email: EMAIL_B });
    expect(emailOnly.error).toBeNull();
    expect(await credentials()).toEqual({ site_url: SITE_A, email: EMAIL_B, token: TOKEN_1 });

    // A site change without a token is refused and changes nothing.
    const repoint = await save({ siteUrl: SITE_B, email: EMAIL_B });
    expect(repoint.error?.code).toBe('45422');
    expect(await credentials()).toEqual({ site_url: SITE_A, email: EMAIL_B, token: TOKEN_1 });

    // A site change WITH a token rotates the same secret: still one.
    const moved = await save({ siteUrl: SITE_B, email: EMAIL_B, apiToken: TOKEN_2 });
    expect(moved.error).toBeNull();
    expect(await secretCount()).toBe(baseline + 1);
    expect(await credentials()).toEqual({ site_url: SITE_B, email: EMAIL_B, token: TOKEN_2 });

    // Invalid inputs.
    expect((await save({ siteUrl: 'https://evil.example.com', email: EMAIL_B, apiToken: TOKEN_2 })).error?.code).toBe('45420');
    expect((await save({ siteUrl: SITE_B, email: 'nope', apiToken: TOKEN_2 })).error?.code).toBe('45421');

    // Disconnect: row and secret both gone, a second delete says false.
    const removed = await deleteWorkspaceJiraConnection(db, { actorUserId: need(qaUserId, 'the QA user'), workspaceId: ws });
    expect(removed.error).toBeNull();
    expect(removed.data).toBe(true);
    expect(await rowCount()).toBe(0);
    expect(await secretCount()).toBe(baseline);
    expect(await credentials()).toBeNull();
    const again = await deleteWorkspaceJiraConnection(db, { actorUserId: need(qaUserId, 'the QA user'), workspaceId: ws });
    expect(again.data).toBe(false);
  });

  it('deleting the workspace cascades the connection and its Vault secret away', async () => {
    expect.hasAssertions();
    const db = service();
    const { client, userId } = await signInQa();
    await client.auth.signOut();
    const cascadeWs = await seedWorkspace(db, userId, 'cascade');
    await setQaRole(db, cascadeWs, userId, 'admin');
    const name = `jira_ws_${cascadeWs}`;
    const count = async () => {
      const [row] = await need(sql, 'the direct Postgres connection')`select count(*)::int as n from vault.secrets where name = ${name}`;
      return row.n as number;
    };
    expect(await count()).toBe(0);
    const saved = await upsertWorkspaceJiraConnection(db, { actorUserId: userId, workspaceId: cascadeWs, siteUrl: SITE_A, email: EMAIL_A, apiToken: TOKEN_1 });
    expect(saved.error).toBeNull();
    expect(await count()).toBe(1);

    const { error } = await db.from('workspaces').delete().eq('id', cascadeWs);
    expect(error).toBeNull();
    trackedWorkspaces.splice(trackedWorkspaces.indexOf(cascadeWs), 1);
    expect(await count()).toBe(0);
  });

  it('keeps the security posture of 0119: INVOKER, empty search_path, service_role only', async () => {
    expect.hasAssertions();
    const rows = await need(sql, 'the direct Postgres connection')`
      select p.proname,
             p.prosecdef as definer,
             p.proconfig as config,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('bunkai_upsert_workspace_jira_connection', 'bunkai_get_workspace_jira_credentials', 'bunkai_delete_workspace_jira_connection')`;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.definer).toBe(false);
      expect(JSON.stringify(row.config)).toContain('search_path=');
      expect(row.auth_exec).toBe(false);
      expect(row.anon_exec).toBe(false);
      expect(row.service_exec).toBe(true);
    }
  });
});

describeAudit('BK-1619 (C) — connect, change and disconnect are audited (migration 0120)', () => {
  let workspaceId: string | null = null;
  let qaUserId: string | null = null;

  const events = async () => {
    const { data, error } = await service()
      .from('activity_log')
      .select('actor_user_id, entity_type, entity_id, action, payload')
      .eq('workspace_id', need(workspaceId, 'the fixture workspace'))
      .like('action', 'jira_connection.%')
      .order('created_at', { ascending: true });
    if (error) { throw error; }
    return data;
  };
  const save = async (args: { siteUrl: string, email: string, apiToken?: string | null }) => upsertWorkspaceJiraConnection(service(), {
    actorUserId: need(qaUserId, 'the QA user'),
    workspaceId: need(workspaceId, 'the fixture workspace'),
    ...args,
  });

  beforeAll(async () => {
    const db = service();
    const { client, userId } = await signInQa();
    await client.auth.signOut();
    qaUserId = userId;
    workspaceId = await seedWorkspace(db, userId, 'audit');
    await setQaRole(db, workspaceId, userId, 'admin');
  }, 30_000);

  afterAll(async () => {
    await cleanupTracked();
  });

  it('writes connected, changed, nothing for a no-op save, and disconnected, with the site host only', async () => {
    expect.hasAssertions();
    const ws = need(workspaceId, 'the fixture workspace');
    const actor = need(qaUserId, 'the QA user');

    expect((await save({ siteUrl: SITE_A, email: EMAIL_A, apiToken: TOKEN_1 })).error).toBeNull();
    expect((await events()).map(e => e.action)).toEqual(['jira_connection.connected']);

    // Same site, same email, no token: nothing changed, nothing logged.
    expect((await save({ siteUrl: SITE_A, email: EMAIL_A })).error).toBeNull();
    expect(await events()).toHaveLength(1);

    // Email change, then a token rotation: two `changed` rows.
    expect((await save({ siteUrl: SITE_A, email: EMAIL_B })).error).toBeNull();
    expect((await save({ siteUrl: SITE_B, email: EMAIL_B, apiToken: TOKEN_2 })).error).toBeNull();
    // A refused save logs nothing.
    expect((await save({ siteUrl: SITE_A, email: EMAIL_B })).error?.code).toBe('45422');

    const removed = await deleteWorkspaceJiraConnection(service(), { actorUserId: actor, workspaceId: ws });
    expect(removed.data).toBe(true);
    // A delete with nothing to delete logs nothing.
    expect((await deleteWorkspaceJiraConnection(service(), { actorUserId: actor, workspaceId: ws })).data).toBe(false);

    const rows = await events();
    expect(rows.map(e => e.action)).toEqual([
      'jira_connection.connected',
      'jira_connection.changed',
      'jira_connection.changed',
      'jira_connection.disconnected',
    ]);
    expect(rows.map(e => (e.payload as { site_host: string }).site_host)).toEqual([
      'bk1619-a.atlassian.net',
      'bk1619-a.atlassian.net',
      'bk1619-b.atlassian.net',
      'bk1619-b.atlassian.net',
    ]);
    for (const row of rows) {
      expect(row.actor_user_id).toBe(actor);
      expect(row.entity_type).toBe('workspace_jira_connection');
      expect(row.entity_id).toBe(ws);
      expect(Object.keys(row.payload as object)).toEqual(['site_host']);
    }
    // Never a token, an email or a secret id in the audit trail.
    const dump = JSON.stringify(rows);
    for (const secret of [TOKEN_1, TOKEN_2, EMAIL_A, EMAIL_B, 'token_secret_id']) {
      expect(dump).not.toContain(secret);
    }
  });
});
