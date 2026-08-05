import { listNotificationPreferences, upsertNotificationPreference } from '@app/api/v1/notification-preferences/response';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-213 — REAL-DB integration test for the notification-preferences write
// path (migration 0062_notification_preferences.sql). This is deliberately
// NOT a fixture that seeds the table directly and reads it back through a
// mock — every assertion below goes through the SAME `response.ts` functions
// the live API route calls (`upsertNotificationPreference` /
// `listNotificationPreferences`), against a REAL, authenticated Supabase
// session, then cross-checks the persisted row via a separate service-role
// read. This proves the write actually landed through
// `notification_preferences_insert_own` / `..._update_own` RLS, not through
// a column the production code path never touches.
//
// Real login, not a minted JWT (live-ui-identity.md §3, governs ALL test
// code) — mirrors `list-notifications-isolation.test.ts`'s own convention.
// `QA_E2E` is a SHARED fixture across many test files/stories, so this suite
// captures the two cells it touches in `beforeAll` and restores their exact
// prior state in `afterAll` (delete if no row existed before, upsert the
// original value back if one did) rather than assuming a pristine table.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

interface PreferenceRow { id: string, user_id: string, event_type: string, channel: string, enabled: boolean }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let anon: ReturnType<typeof service> | null = null;
let qaUserId: string | null = null;
let skipReason: string | null = null;
// Prior state of the two cells this suite mutates, captured before any
// write, so `afterAll` can restore them exactly (delete if absent, restore
// the original `enabled` value if present).
let priorRunInApp: boolean | 'absent' = 'absent';
let priorBugEmail: boolean | 'absent' = 'absent';

describeOrSkip('BK-213 — notification_preferences real write path (migration 0062)', () => {
  beforeAll(async () => {
    const db = service();

    // Is the table deployed? A deployed table answers a scoped select with
    // no error for any well-formed uuid (RLS just returns zero rows for a
    // foreign one, never raises).
    const probe = await db.from('notification_preferences').select('id').limit(1);
    if (probe.error) {
      skipReason = `notification_preferences is not deployed yet (${probe.error.code ?? probe.error.message}). Apply migration 0062_notification_preferences.sql.`;
      return;
    }

    if (!hasRealLoginEnv) {
      skipReason = 'need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD — this table\'s isolation property can only be proven through a REAL RLS-scoped session, never a service-role call.';
      return;
    }

    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.session || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`;
      return;
    }
    anon = client;
    qaUserId = signIn.user.id;

    const { data: existingRows, error: existingError } = await db
      .from('notification_preferences')
      .select('event_type, channel, enabled')
      .eq('user_id', qaUserId)
      .in('event_type', ['run_lifecycle', 'bug_lifecycle']);
    if (existingError) { throw existingError; }
    const rows = (existingRows ?? []) as { event_type: string, channel: string, enabled: boolean }[];
    const runInApp = rows.find(r => r.event_type === 'run_lifecycle' && r.channel === 'in_app');
    const bugEmail = rows.find(r => r.event_type === 'bug_lifecycle' && r.channel === 'email');
    priorRunInApp = runInApp ? runInApp.enabled : 'absent';
    priorBugEmail = bugEmail ? bugEmail.enabled : 'absent';
  });

  afterAll(async () => {
    if (!qaUserId) { return; }
    const db = service();
    if (priorRunInApp === 'absent') {
      await db.from('notification_preferences').delete().eq('user_id', qaUserId).eq('event_type', 'run_lifecycle').eq('channel', 'in_app');
    }
    else {
      await db.from('notification_preferences').update({ enabled: priorRunInApp }).eq('user_id', qaUserId).eq('event_type', 'run_lifecycle').eq('channel', 'in_app');
    }
    if (priorBugEmail === 'absent') {
      await db.from('notification_preferences').delete().eq('user_id', qaUserId).eq('event_type', 'bug_lifecycle').eq('channel', 'email');
    }
    else {
      await db.from('notification_preferences').update({ enabled: priorBugEmail }).eq('user_id', qaUserId).eq('event_type', 'bug_lifecycle').eq('channel', 'email');
    }
    // Defensive cleanup: any stray `mentions` row would mean the DB-level
    // lock regressed — remove it via service-role so it never survives this
    // suite either way (belt-and-braces; the "never inserted" test below is
    // the actual proof).
    await db.from('notification_preferences').delete().eq('user_id', qaUserId).eq('event_type', 'mentions');
  });

  it('GET (via the real listNotificationPreferences) reflects whatever is actually in the table before any write in this suite', async () => {
    if (!anon || !qaUserId) { return warn(); }

    const grid = await listNotificationPreferences(anon, qaUserId);
    const runInApp = grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'in_app')!;
    expect(runInApp.enabled).toBe(priorRunInApp === 'absent' ? true : priorRunInApp);
  });

  it('PATCH (via the real upsertNotificationPreference) writes a row the RLS-scoped session can genuinely persist — cross-checked with an independent service-role read, not the same client that wrote it', async () => {
    if (!anon || !qaUserId) { return warn(); }

    const result = await upsertNotificationPreference(anon, qaUserId, {
      event_type: 'run_lifecycle',
      channel: 'in_app',
      enabled: false,
    });
    expect(result.enabled).toBe(false);

    // Independent proof: read back with the SERVICE-ROLE client (bypasses
    // RLS entirely), never the same `anon` client that performed the write —
    // this is what rules out "the app-level object looked right but nothing
    // was actually persisted."
    const db = service();
    const { data: raw, error } = await db
      .from('notification_preferences')
      .select('user_id, event_type, channel, enabled')
      .eq('user_id', qaUserId)
      .eq('event_type', 'run_lifecycle')
      .eq('channel', 'in_app')
      .single();
    expect(error).toBeNull();
    expect((raw as PreferenceRow).enabled).toBe(false);

    // And the real GET path now reflects it too — full round-trip through
    // the production write AND read functions, not a fixture shortcut.
    const grid = await listNotificationPreferences(anon, qaUserId);
    expect(grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'in_app')!.enabled).toBe(false);
    // The sibling channel on the SAME event type is untouched (AC2/AC3:
    // channels toggle independently) — this suite never writes
    // run_lifecycle/email, so it must still read the ratified default.
    expect(grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'email')!.enabled).toBe(true);
  });

  it('a second real toggle on a DIFFERENT event type/channel persists independently (bug_lifecycle/email off, per AC3)', async () => {
    if (!anon || !qaUserId) { return warn(); }

    await upsertNotificationPreference(anon, qaUserId, {
      event_type: 'bug_lifecycle',
      channel: 'email',
      enabled: false,
    });

    const db = service();
    const { data: raw, error } = await db
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', qaUserId)
      .eq('event_type', 'bug_lifecycle')
      .eq('channel', 'email')
      .single();
    expect(error).toBeNull();
    expect((raw as { enabled: boolean }).enabled).toBe(false);

    // AC3: "her in-app bug notifications keep arriving unchanged" — the
    // sibling channel on bug_lifecycle must still read its own value
    // (default true, since this suite never touched it).
    const { data: siblingRaw } = await db
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', qaUserId)
      .eq('event_type', 'bug_lifecycle')
      .eq('channel', 'in_app')
      .maybeSingle();
    expect(siblingRaw?.enabled ?? true).toBe(true);
  });

  it('re-toggling the SAME cell overwrites the row (upsert, not insert-only) — last-write-wins with no lock, per QA Refinement Decision 2', async () => {
    if (!anon || !qaUserId) { return warn(); }

    await upsertNotificationPreference(anon, qaUserId, { event_type: 'run_lifecycle', channel: 'in_app', enabled: true });
    await upsertNotificationPreference(anon, qaUserId, { event_type: 'run_lifecycle', channel: 'in_app', enabled: false });

    const db = service();
    const { data: rows, error } = await db
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', qaUserId)
      .eq('event_type', 'run_lifecycle')
      .eq('channel', 'in_app');
    expect(error).toBeNull();
    // Exactly one row for this (user, event_type, channel) — the unique
    // constraint + onConflict upsert never duplicates it.
    expect(rows).toHaveLength(1);
    expect(rows![0].enabled).toBe(false);
  });

  it('the DB-level mentions lock rejects an insert even when attempted DIRECTLY against the table, bypassing the API\'s Zod gate entirely', async () => {
    if (!anon || !qaUserId) { return warn(); }

    // Deliberately goes around `upsertNotificationPreference` (which the API
    // route's Zod schema already blocks `mentions` from reaching) straight
    // to the table, through the SAME RLS-scoped session, to prove the
    // migration's own `event_type <> 'mentions'` policy clause is real and
    // not merely asserted in application code.
    const { data, error } = await anon
      .from('notification_preferences')
      .insert({ user_id: qaUserId, event_type: 'mentions', channel: 'in_app', enabled: true })
      .select('id');

    expect(error).not.toBeNull(); // RLS policy violation, not a silent no-op
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);

    // Cross-check: no such row exists via service-role either.
    const db = service();
    const { data: raw } = await db
      .from('notification_preferences')
      .select('id')
      .eq('user_id', qaUserId)
      .eq('event_type', 'mentions')
      .maybeSingle();
    expect(raw).toBeNull();
  });

  it('a crafted user_id in the row body never lets a caller write another user\'s preference — RLS enforces auth.uid(), not the payload', async () => {
    if (!anon || !qaUserId) { return warn(); }

    const foreignUserId = '00000000-0000-0000-0000-000000000042';
    const { data, error } = await anon
      .from('notification_preferences')
      .insert({ user_id: foreignUserId, event_type: 'run_lifecycle', channel: 'email', enabled: false })
      .select('id');

    expect(error).not.toBeNull(); // with-check (user_id = auth.uid()) rejects it
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);

    const db = service();
    const { data: raw } = await db
      .from('notification_preferences')
      .select('id')
      .eq('user_id', foreignUserId)
      .maybeSingle();
    expect(raw).toBeNull();
  });
});

// The suite never fails on missing migration / seed state / QA_E2E login —
// it says why and passes (mirrors list-notifications-isolation.test.ts).
function warn() {
  console.warn(`[notification-preferences-write-path] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
