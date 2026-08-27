import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-635 — the mandatory ADR-0012 / rpc-authorization.md §5 DB-integration
// guard for the two SECURITY DEFINER search RPCs that shipped granted to
// `authenticated` with a caller-supplied, never-bound actor id:
//
//   * public.bunkai_search_atcs(uuid, text, uuid, uuid, text, int)  — 0027
//   * public.bunkai_filter_tests_by_tag(uuid, text)                  — 0030
//
// This file covers BOTH because they share one defect and one migration
// (0082_bk635_search_rpc_actor_bind_and_grant_revoke). It lives beside
// `search-isolation.test.ts` rather than being split across `lib/atcs/` and
// `lib/tests/`.
//
// WHY THE EXISTING SUITES WERE BLIND. `lib/atcs/search-isolation.test.ts` and
// `lib/tests/tags.test.ts` both build their client from
// SUPABASE_SERVICE_ROLE_KEY. `service_role` has always held EXECUTE on these
// functions and its auth.uid() is always NULL, so neither the `authenticated`
// grant nor a missing actor bind is observable from those suites — they were
// green throughout the vulnerability and would have stayed green. A new test
// on the same client would prove nothing. Everything below therefore reaches
// the database as something OTHER than a service-role client.
//
// Two blocks, two mechanisms, because the two properties are reachable by
// different paths:
//
//  (A) GRANT REVOKE — a REAL `authenticated` session, obtained through the
//      app's own password path (`supabase.auth.signInWithPassword` on the anon
//      key, as the declared `testing.automation_identity`: QA_E2E_USER_EMAIL /
//      QA_E2E_USER_PASSWORD). It spoofs ONLY the RPC's p_actor_user_id
//      parameter, with a uuid belonging to nobody — no JWT is minted and no
//      account is impersonated. Pre-fix these calls SUCCEED (jsonb, no error);
//      post-fix PostgREST refuses them with `permission denied for function`.
//      A control case first proves the very same client CAN still reach an RPC
//      that `authenticated` legitimately holds, so a green here can never be
//      an artifact of an anonymous or broken client.
//
//  (B) ACTOR BIND — deliberately NOT reachable from block (A). Once the grant
//      is revoked, no client can present the function with a populated
//      auth.uid(): a session caller is refused at the permission check, and a
//      service-role caller carries no `sub`. The bind is defense in depth for
//      a user JWT that should never arrive. To exercise it against the REAL
//      function on the REAL database, this block opens a direct Postgres
//      connection (POSTGRES_URL, read by name, never inlined) and sets
//      `request.jwt.claims` inside a transaction — the exact setting auth.uid()
//      reads. It asserts both halves of the guard: a mismatched actor RAISES
//      42501 `actor mismatch`, and a NULL auth.uid() (the PAT rail, which
//      carries no `sub`) still passes through. That second assertion is the
//      point of the `auth.uid() is not null` precondition and exists so a
//      future edit cannot quietly drop it. It also asserts, structurally, that
//      the guard sits at STEP 0 — before the function's first table read — and
//      that `authenticated` is absent from both ACLs.
//
// Env-gated in the two blocks independently, per repo convention: (A) needs
// url + anon key + service key + the QA fixture credentials; (B) needs
// POSTGRES_URL. Missing env SKIPS; a login that fails at runtime logs and
// returns rather than blocking a build on a fixture-account hiccup.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

const hasSessionEnv = Boolean(url && anonKey && serviceKey && qaEmail && qaPassword);
const describeSession = hasSessionEnv ? describe : describe.skip;
const describePg = pgUrl ? describe : describe.skip;

const ATC_SEARCH_RPC = 'bunkai_search_atcs';
const TAG_FILTER_RPC = 'bunkai_filter_tests_by_tag';
// Granted to `authenticated` by 0030_test_tags.sql:127 and deliberately left
// that way — it takes no actor and reads no table. The control case.
const CONTROL_RPC = 'bunkai_normalize_test_tags';

// Belongs to nobody: not a user, not a workspace member, not a project.
const NOBODY_UUID = '00000000-0000-0000-0000-0000000006a3';
const NOBODY_PROJECT_UUID = '00000000-0000-0000-0000-0000000006a4';

interface RpcError { code?: string | null, message?: string | null }

function anonSession() {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

let sessionClient: ReturnType<typeof anonSession> | null = null;
let qaUserId: string | null = null;
let skipReason: string | null = null;

describeSession('BK-635 — the two search RPCs are unreachable from a real authenticated session', () => {
  beforeAll(async () => {
    const client = anonSession();
    const { data, error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (error || !data.session || !data.user) {
      skipReason = `QA_E2E login failed (${error?.message ?? 'no session returned'}).`;
      return;
    }
    sessionClient = client;
    qaUserId = data.user.id;
  });

  afterAll(async () => {
    await sessionClient?.auth.signOut();
    sessionClient = null;
  });

  it('control: the session client is a genuine `authenticated` caller and can reach an RPC it legitimately holds', async () => {
    if (skipReason) { console.log(`SKIP: ${skipReason}`); return; }
    expect(sessionClient).not.toBeNull();

    const { data: userData } = await sessionClient!.auth.getUser();
    expect(userData.user?.id).toBe(qaUserId!);

    const { error } = await sessionClient!.rpc(CONTROL_RPC, { p_tags: ['Smoke'] });
    // If THIS errored, every assertion below would be meaningless — a refusal
    // would say nothing about the two grants under test.
    expect(error).toBeNull();
  });

  it(`${ATC_SEARCH_RPC}: a session caller spoofing p_actor_user_id is refused by the grant`, async () => {
    if (skipReason) { console.log(`SKIP: ${skipReason}`); return; }

    const { data, error } = await sessionClient!.rpc(ATC_SEARCH_RPC, {
      p_actor_user_id: NOBODY_UUID,
      p_query: 'login',
      p_project_id: NOBODY_PROJECT_UUID,
      p_module_id: null,
      p_layer: null,
      p_limit: 20,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    const rpcError = error as RpcError;
    expect(rpcError.code).toBe('42501');
    expect(rpcError.message ?? '').toMatch(/permission denied/i);
  });

  it(`${TAG_FILTER_RPC}: a session caller spoofing p_actor_user_id is refused by the grant`, async () => {
    if (skipReason) { console.log(`SKIP: ${skipReason}`); return; }

    const { data, error } = await sessionClient!.rpc(TAG_FILTER_RPC, {
      p_actor_user_id: NOBODY_UUID,
      p_tag: 'smoke',
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    const rpcError = error as RpcError;
    expect(rpcError.code).toBe('42501');
    expect(rpcError.message ?? '').toMatch(/permission denied/i);
  });
});

interface AclRow { proname: string, acl: string, guard_pos: number, first_read_pos: number }

describePg('BK-635 — the actor bind fires at step 0 and preserves the NULL-uid PAT rail', () => {
  let sql: SQL | null = null;

  beforeAll(() => {
    sql = new SQL(pgUrl!);
  });

  afterAll(async () => {
    await sql?.end();
    sql = null;
  });

  // Calls `fn` with request.jwt.claims set to `sub`, inside a transaction so
  // the setting is local and never leaks to another connection user. Returns
  // the raised error message, or null when the call completed.
  async function callWithUid(statement: string, sub: string | null): Promise<string | null> {
    try {
      await sql!.begin(async (tx) => {
        const claims = sub === null ? '' : JSON.stringify({ sub, role: 'authenticated' });
        await tx`select set_config('request.jwt.claims', ${claims}, true)`;
        await tx.unsafe(statement);
      });
      return null;
    }
    catch (error) {
      return (error as Error).message;
    }
  }

  const atcCall = `select public.bunkai_search_atcs('${NOBODY_UUID}'::uuid, 'login', '${NOBODY_PROJECT_UUID}'::uuid, null, null, 20)`;
  const tagCall = `select public.bunkai_filter_tests_by_tag('${NOBODY_UUID}'::uuid, 'smoke')`;

  it(`${ATC_SEARCH_RPC}: a populated auth.uid() that disagrees with p_actor_user_id raises 42501`, async () => {
    const message = await callWithUid(atcCall, NOBODY_PROJECT_UUID);
    expect(message ?? '').toMatch(/actor mismatch/i);
  });

  it(`${TAG_FILTER_RPC}: a populated auth.uid() that disagrees with p_actor_user_id raises 42501`, async () => {
    const message = await callWithUid(tagCall, NOBODY_PROJECT_UUID);
    expect(message ?? '').toMatch(/actor mismatch/i);
  });

  it(`${ATC_SEARCH_RPC}: a NULL auth.uid() (the PAT rail) still passes the bind`, async () => {
    expect(await callWithUid(atcCall, null)).toBeNull();
  });

  it(`${TAG_FILTER_RPC}: a NULL auth.uid() (the PAT rail) still passes the bind`, async () => {
    expect(await callWithUid(tagCall, null)).toBeNull();
  });

  it('both functions: the bind precedes the first table read, and `authenticated` is off both ACLs', async () => {
    const rows = await sql!`
      select p.proname,
             coalesce(array_to_string(p.proacl, ' | '), '') as acl,
             position('auth.uid()' in p.prosrc)  as guard_pos,
             position('from public.' in p.prosrc) as first_read_pos
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (${ATC_SEARCH_RPC}, ${TAG_FILTER_RPC})
    `;

    expect(rows.length).toBe(2);
    for (const row of rows) {
      // Step 0: the bind is present AND sits ahead of every table read, so
      // nothing can leak through a branch taken before it (ADR-0012).
      expect(row.guard_pos).toBeGreaterThan(0);
      expect(row.first_read_pos).toBeGreaterThan(0);
      expect(row.guard_pos).toBeLessThan(row.first_read_pos);
      // The grant that was the defect.
      expect(row.acl).not.toMatch(/(^|\|)\s*authenticated=/);
      expect(row.acl).not.toMatch(/(^|\|)\s*anon=/);
      expect(row.acl).toMatch(/service_role=X/);
    }
  });
});
