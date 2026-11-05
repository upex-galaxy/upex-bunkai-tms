import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { expect } from 'bun:test';

// BK-1589 G5 — shared harness for the membership lock proofs. A test that only
// looks at the outcome cannot tell a lock from a lucky interleaving, and two
// HTTP calls are not guaranteed to overlap inside Postgres. This harness forces
// the overlap and observes it:
//
//   * a raw connection (POSTGRES_URL_NON_POOLING, read by name) only HOLDS a row
//     lock in an open transaction and WATCHES pg_blocking_pids; it never acts as
//     a user;
//   * every RPC under test runs through a real signed-in session, or the service
//     client where that is the shipped caller (invite accept);
//   * each call is fired only after the previous one is observed blocked, so the
//     lock queue order is the order of the calls. Then the holder lets go.
//
// Fixtures are throwaway users and workspaces under a per-file prefix, and
// `teardown` fails the file if a single row or user survives. Hold times stay
// well under the 8s statement and lock timeouts of `authenticated`.

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const pgUrl = process.env.POSTGRES_URL_NON_POOLING;
export const hasLockEnv = Boolean(url && anonKey && serviceKey && pgUrl);

const BLOCK_WAIT_MS = 3_000;
const POLL_MS = 50;

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

function serviceClient() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
export type Client = ReturnType<typeof serviceClient>;

interface Seeded {
  workspaceId: string
  projectId: string
  moduleId: string
}

export interface OverlapResult<T> {
  // How many backends were observed waiting behind the holder after each call
  // was fired. A correct lock on N calls reads [1, 2, ..., N].
  blocked: number[]
  results: T[]
}

// Holds a FOR UPDATE on one member row, fires each call in order, and records
// how many backends queue behind the holder after each one. `whileHeld` runs
// once they all queued, for something that must commit during the wait. Always
// rolls back and always settles every fired call, so a failed assertion leaves
// no lock.
export async function overlapOnMemberRow<T>(
  target: { workspaceId: string, userId: string },
  calls: Array<() => PromiseLike<T>>,
  whileHeld?: () => Promise<void>,
): Promise<OverlapResult<T>> {
  const holderPool = new SQL(pgUrl!, { max: 1 });
  const observerPool = new SQL(pgUrl!, { max: 1 });
  const fired: Array<Promise<T>> = [];
  const blocked: number[] = [];
  try {
    const holder = await holderPool.reserve();
    try {
      await holder`begin`;
      const [{ pid }] = await holder`select pg_backend_pid() as pid`;
      const locked = await holder`
        select 1 from public.workspace_members
         where workspace_id = ${target.workspaceId}::uuid and user_id = ${target.userId}::uuid
           for update`;
      if (locked.length !== 1) {
        throw new Error('[membership-lock] the member row to hold does not exist');
      }
      for (const [index, call] of calls.entries()) {
        // Promise.resolve starts it now: a supabase-js builder is lazy and only
        // sends the request once something calls its `then`.
        fired.push(Promise.resolve(call()));
        blocked.push(await waitForChain(observerPool, Number(pid), index + 1));
      }
      await whileHeld?.();
    }
    finally {
      await holder`rollback`;
      holder.release();
    }
    return { blocked, results: await Promise.all(fired) };
  }
  finally {
    await Promise.allSettled(fired);
    await holderPool.close();
    await observerPool.close();
  }
}

// Counts the backends waiting behind `pid`, directly or through another waiter,
// until `expected` is reached or the wait runs out. Keyed on the holder's pid,
// never on query text, so nothing outside this chain can be counted.
async function waitForChain(observer: SQL, pid: number, expected: number): Promise<number> {
  const deadline = Date.now() + BLOCK_WAIT_MS;
  let seen = 0;
  while (Date.now() < deadline) {
    const [row] = await observer`
      with recursive chain as (
        select a.pid from pg_stat_activity a where ${pid}::int = any(pg_blocking_pids(a.pid))
        union
        select a.pid from pg_stat_activity a join chain c on c.pid = any(pg_blocking_pids(a.pid))
      )
      select count(*)::int as waiting from chain`;
    seen = Number(row.waiting);
    if (seen >= expected) {
      return seen;
    }
    await Bun.sleep(POLL_MS);
  }
  return seen;
}

export function createMembershipFixture<P extends string>(tag: string, personas: readonly P[]) {
  const prefix = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const users = Object.fromEntries(personas.map(p => [p, { id: '', email: `${prefix}-${p}@example.test` }])) as Record<P, { id: string, email: string }>;
  const clients = {} as Record<P, Client>;
  const workspaceIds: string[] = [];
  const service = serviceClient;

  function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
    if (result.error || result.data === null || result.data === undefined) {
      throw new Error(`[${tag}] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
    }
    return result.data;
  }

  async function setup(): Promise<void> {
    const db = service();
    for (const persona of personas) {
      const { data, error } = await db.auth.admin.createUser({ email: users[persona].email, password, email_confirm: true });
      if (error || !data.user) {
        throw new Error(`[${tag}] createUser ${persona}: ${error?.message}`);
      }
      users[persona].id = data.user.id;
    }
    for (const persona of personas) {
      const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
      const { error } = await client.auth.signInWithPassword({ email: users[persona].email, password });
      if (error) {
        throw new Error(`[${tag}] sign-in failed for a fixture user: ${error.message}`);
      }
      clients[persona] = client;
    }
  }

  async function teardown(): Promise<void> {
    const db = service();
    const failures: string[] = [];
    for (const id of workspaceIds) {
      const { error } = await db.from('workspaces').delete().eq('id', id);
      if (error) {
        failures.push(`workspace ${id}: ${error.message}`);
      }
    }
    for (const persona of personas) {
      if (!users[persona].id) {
        continue;
      }
      await db.from('access_tokens').delete().eq('user_id', users[persona].id);
      const { error } = await db.auth.admin.deleteUser(users[persona].id);
      if (error) {
        failures.push(`user ${persona}: ${error.message}`);
      }
    }
    const { count: wsLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${prefix}%`);
    if ((wsLeft ?? 0) !== 0) {
      failures.push(`${wsLeft} ${prefix} workspaces remain`);
    }
    const { count: tokensLeft } = await db.from('access_tokens').select('id', { count: 'exact', head: true }).like('name', `${prefix}%`);
    if ((tokensLeft ?? 0) !== 0) {
      failures.push(`${tokensLeft} ${prefix} tokens remain`);
    }
    for (const persona of personas) {
      if (users[persona].id && (await db.auth.admin.getUserById(users[persona].id)).data?.user) {
        failures.push(`user ${persona} remains`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`[${tag}] cleanup failed: ${failures.join('; ')}`);
    }
  }

  // A fresh workspace per scenario, because every scenario mutates membership.
  async function seedWorkspace(name: string, members: Partial<Record<P, Role>>): Promise<Seeded> {
    const db = service();
    const ws = must(await db.from('workspaces')
      .insert({ slug: `${prefix}-${name}`, name: `${prefix} ${name}`, owner_user_id: users[personas[0]].id })
      .select('id')
      .single(), `workspace ${name}`);
    workspaceIds.push(ws.id);
    const rows = Object.entries(members).map(([persona, role]) => ({
      workspace_id: ws.id,
      user_id: users[persona as P].id,
      role,
      status: 'active',
    }));
    const { error } = await db.from('workspace_members').insert(rows);
    if (error) {
      throw new Error(`[${tag}] members ${name}: ${error.message}`);
    }
    const project = must(await db.from('projects')
      .insert({ workspace_id: ws.id, slug: `${prefix}-${name}-p`, name: `${prefix} ${name} project` })
      .select('id')
      .single(), `project ${name}`);
    const mod = must(await db.from('modules')
      .insert({ project_id: project.id, path: 'checkout', name: 'Checkout' })
      .select('id')
      .single(), `module ${name}`);
    return { workspaceId: ws.id, projectId: project.id, moduleId: mod.id };
  }

  async function seedBug(seed: Seeded, args: { title: string, author: P, assignee?: P }): Promise<string> {
    const row = must(await service().from('bugs').insert({
      workspace_id: seed.workspaceId,
      project_id: seed.projectId,
      module_id: seed.moduleId,
      title: `${prefix} ${args.title}`,
      severity: 'P2',
      status: 'open',
      assignee_user_id: args.assignee ? users[args.assignee].id : null,
      created_by: users[args.author].id,
    }).select('id').single(), `bug ${args.title}`);
    return row.id;
  }

  async function seedToken(persona: P, workspaceId: string, name: string): Promise<string> {
    const row = must(await service().from('access_tokens').insert({
      user_id: users[persona].id,
      workspace_id: workspaceId,
      name: `${prefix} ${name}`,
      token_prefix: Math.random().toString(36).slice(2, 10),
      scopes: ['atc:read'],
    }).select('id').single(), `token ${name}`);
    return row.id;
  }

  async function memberRow(workspaceId: string, persona: P) {
    const { data, error } = await service().from('workspace_members').select('role, status').eq('workspace_id', workspaceId).eq('user_id', users[persona].id).maybeSingle();
    if (error) {
      throw error;
    }
    return data;
  }

  async function activity(workspaceId: string, action: string) {
    const { data, error } = await service().from('activity_log').select('entity_id, payload').eq('workspace_id', workspaceId).eq('action', action);
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async function bugAssignee(bugId: string): Promise<string | null> {
    const { data, error } = await service().from('bugs').select('assignee_user_id').eq('id', bugId).single();
    if (error) {
      throw error;
    }
    return data.assignee_user_id as string | null;
  }

  async function tokenRevokedAt(tokenId: string): Promise<string | null> {
    const { data, error } = await service().from('access_tokens').select('revoked_at').eq('id', tokenId).single();
    if (error) {
      throw error;
    }
    return data.revoked_at as string | null;
  }

  return { prefix, users, clients, service, must, setup, teardown, seedWorkspace, seedBug, seedToken, memberRow, activity, bugAssignee, tokenRevokedAt };
}

// The chain a correct lock produces: one more waiter per call fired.
export function expectEveryCallBlocked(blocked: number[]): void {
  expect(blocked).toEqual(blocked.map((_, index) => index + 1));
}
