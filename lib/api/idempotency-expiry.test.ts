import { beforeEach, describe, expect, it, mock } from 'bun:test';

void mock.module('server-only', () => ({}));

// BK-1724 — a row past `expires_at` must be treated as no row: the same key
// after the window is a NEW request (ADR-0002), not a replay or a 409.
// DB-free: ONE in-memory `idempotency_keys` double (referentially stable for
// the whole file) stands in for the service-role client, enforcing the
// `unique (user_id, endpoint, key)` constraint like Postgres does.

interface Row {
  id: string
  user_id: string
  endpoint: string
  key: string
  request_hash: string
  status: string
  response_snapshot: unknown
  response_status: number | null
  expires_at: string
  workspace_id: string | null
}

const rows: Row[] = [];
let seq = 0;
const tick = async () => Promise.resolve();

type Filter = (r: Row) => boolean;

class Query {
  private filters: Filter[] = [];
  private op: 'select' | 'delete' | 'update' | 'insert' = 'select';
  private patch: Record<string, unknown> = {};
  private wantRows = false;
  private one = false;

  select(_cols?: string) {
    this.wantRows = true;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.op = 'update';
    this.patch = patch;
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.op = 'insert';
    this.patch = values;
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push(r => (r as unknown as Record<string, unknown>)[col] === val);
    return this;
  }

  lte(col: string, val: string) {
    this.filters.push(r => Date.parse((r as unknown as Record<string, string>)[col]) <= Date.parse(val));
    return this;
  }

  async maybeSingle() {
    this.one = true;
    return this.run();
  }

  // `.single()` on insert (returns the inserted row).
  async single() {
    return this.run();
  }

  async then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return this.run().then(resolve, reject);
  }

  private async run(): Promise<{ data: unknown, error: { code?: string, message: string } | null }> {
    await tick();
    const match = rows.filter(r => this.filters.every(f => f(r)));
    if (this.op === 'insert') {
      const v = this.patch as unknown as Row;
      if (rows.some(r => r.user_id === v.user_id && r.endpoint === v.endpoint && r.key === v.key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      const row: Row = {
        ...v,
        response_snapshot: null,
        response_status: null,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        workspace_id: v.workspace_id ?? null,
        id: `row-${++seq}`,
      };
      rows.push(row);
      return { data: { id: row.id }, error: null };
    }
    if (this.op === 'delete') {
      for (const r of match) { rows.splice(rows.indexOf(r), 1); }
      return { data: match.map(r => ({ id: r.id })), error: null };
    }
    if (this.op === 'update') {
      for (const r of match) { Object.assign(r, this.patch); }
      return { data: match.map(r => ({ id: r.id })), error: null };
    }
    return { data: this.one ? (match[0] ?? null) : match, error: null };
  }
}

const admin = { from: (_t: string) => new Query() };
void mock.module('@lib/supabase/admin', () => ({ createAdminClient: () => admin }));

const USER = '11111111-1111-1111-1111-111111111111';
const ENDPOINT = 'POST /api/v1/atcs';
const HOUR = 3600 * 1000;

function headers(key: string) { return new Headers({ 'idempotency-key': key }); }
function args(key: string, payload: unknown) {
  return { headers: headers(key), userId: USER, endpoint: ENDPOINT, requestPayload: payload };
}

async function hashOf(payload: unknown) {
  // Same hash the helper computes: seed a row through the helper itself.
  const { beginIdempotentRequest } = await import('./idempotency');
  const r = await beginIdempotentRequest(args('hash-probe-key', payload));
  const probe = rows.find(x => x.id === r.token.rowId)!;
  rows.splice(rows.indexOf(probe), 1);
  return probe.request_hash;
}

async function seed(key: string, payload: unknown, over: Partial<Row>): Promise<Row> {
  const row: Row = {
    id: `seed-${++seq}`,
    user_id: USER,
    endpoint: ENDPOINT,
    key,
    request_hash: await hashOf(payload),
    status: 'succeeded',
    response_snapshot: { atc: { id: 'OLD' } },
    response_status: 201,
    expires_at: new Date(Date.now() + HOUR).toISOString(),
    workspace_id: null,
    ...over,
  };
  rows.push(row);
  return row;
}

async function expectConflict(p: Promise<unknown>) {
  try {
    await p;
    throw new Error('expected rejection');
  }
  catch (err) {
    expect((err as { code?: string }).code).toBe('conflict');
    expect((err as { status?: number }).status).toBe(409);
  }
}

const past = () => new Date(Date.now() - HOUR).toISOString();

describe('beginIdempotentRequest expiry (BK-1724)', () => {
  beforeEach(() => { rows.length = 0; });

  it('an expired succeeded row is NOT replayed: a new request replaces it', async () => {
    const { beginIdempotentRequest } = await import('./idempotency');
    const old = await seed('expired-key-0001', { title: 'a' }, { expires_at: past() });

    const r = await beginIdempotentRequest(args('expired-key-0001', { title: 'a' }));

    expect(r.isReplay).toBe(false);
    expect(r.token.rowId).not.toBe(old.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].id).toBe(r.token.rowId);
  });

  it('an expired row with a DIFFERENT payload hash does not 409', async () => {
    const { beginIdempotentRequest } = await import('./idempotency');
    await seed('expired-key-0002', { title: 'a' }, { expires_at: past() });

    const r = await beginIdempotentRequest(args('expired-key-0002', { title: 'b' }));

    expect(r.isReplay).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('expired pending and failed rows are also treated as no row', async () => {
    const { beginIdempotentRequest } = await import('./idempotency');
    await seed('expired-key-0003', { t: 1 }, { status: 'pending', expires_at: past() });
    await seed('expired-key-0004', { t: 1 }, { status: 'failed', expires_at: past() });

    const a = await beginIdempotentRequest(args('expired-key-0003', { t: 1 }));
    const b = await beginIdempotentRequest(args('expired-key-0004', { t: 1 }));

    expect(a.isReplay).toBe(false);
    expect(b.isReplay).toBe(false);
    expect(rows.every(r => r.status === 'pending')).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('a non-expired succeeded row still replays the stored snapshot', async () => {
    const { beginIdempotentRequest } = await import('./idempotency');
    const old = await seed('live-key-000001', { title: 'a' }, {});

    const r = await beginIdempotentRequest(args('live-key-000001', { title: 'a' }));

    expect(r.isReplay).toBe(true);
    if (!r.isReplay) { throw new Error('expected replay'); }
    expect(r.status).toBe(201);
    expect(r.snapshot).toEqual({ atc: { id: 'OLD' } });
    expect(r.token.rowId).toBe(old.id);
  });

  it('a non-expired row with a different payload still 409s', async () => {
    const { beginIdempotentRequest } = await import('./idempotency');
    await seed('live-key-000002', { title: 'a' }, {});

    await expectConflict(beginIdempotentRequest(args('live-key-000002', { title: 'b' })));
  });

  it('two racers on an expired row end with exactly one winner', async () => {
    const { beginIdempotentRequest } = await import('./idempotency');
    await seed('race-key-000001', { title: 'a' }, { expires_at: past() });

    const results = await Promise.allSettled([
      beginIdempotentRequest(args('race-key-000001', { title: 'a' })),
      beginIdempotentRequest(args('race-key-000001', { title: 'a' })),
    ]);

    const ok = results.filter(r => r.status === 'fulfilled');
    const lost = results.filter(r => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0]).reason.code).toBe('conflict');
    expect(rows).toHaveLength(1);
  });
});
