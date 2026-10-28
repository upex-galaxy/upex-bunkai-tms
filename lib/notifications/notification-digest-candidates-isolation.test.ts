import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-214 — DB-integration test for `bunkai_notification_digest_candidates`
// (migration 0078_notification_digest_log.sql), mandatory per ADR-0012 /
// rpc-authorization.md §7 in the same slice as the migration.
//
// The function is `SECURITY DEFINER`, granted to `service_role` only — there
// is no client session that can call it, so (unlike
// `list-notifications-isolation.test.ts`) this suite never signs in as
// QA_E2E. Its whole authorization posture is the query body itself
// re-deriving what RLS would otherwise enforce (live workspace membership,
// 90-day retention), which is exactly what this suite proves with direct
// service-role fixture rows — the same "service-role in tests for fixture
// seed... obtains no session" allowance `rpc-authorization.md` §5 already
// sanctions, applied here to the assertion itself rather than only setup.
//
// Covers:
//   (a) baseline — an unread, recent, preference-enabled row is a candidate.
//   (b) already-read rows are excluded.
//   (c) 90-day retention: day 91 excluded, day 89 included.
//   (d) membership revoked (status flipped to 'suspended') excludes the row —
//       re-derived explicitly since service-role bypasses RLS.
//   (e) an explicit `enabled: false` email preference (bug_lifecycle)
//       excludes a `bug.*` row; an absent preference row does not (0062's
//       own "no seed" default-enabled convention).
//   (f) a row whose entity never resolves (bad `entity_id`) is excluded by
//       the join, not surfaced with a broken link.
//   (g) `event_type` filter: only the 5 real notification-producing values
//       are ever candidates — a row seeded with an event_type outside that
//       set (proving the migration's own vocabulary correction) is excluded.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasServiceEnv = Boolean(url && serviceKey);
const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_notification_digest_candidates';
const PREFIX = `bk214-digest-candidates-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const NONEXISTENT_ENTITY_UUID = '00000000-0000-0000-0000-000000000099';

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

interface CandidateRow {
  recipient_user_id: string
  recipient_email: string
  workspace_id: string
  project_id: string
  project_name: string
  project_slug: string
  notification_id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

interface Fixture {
  workspaceId: string
  memberBaseline: string
  memberRevoked: string
  memberPrefDisabled: string
  bugId: string
  notifIds: Record<string, string>
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;
// Tracked INDEPENDENTLY of `fixture` (set as soon as each resource exists,
// not gated on the whole beforeAll completing) so afterAll can still clean up
// a partial run — a live-DB test whose cleanup only fires on full success
// leaks a throwaway workspace, or worse, a stray disabled preference row on
// a REAL shared user, the moment any later setup step throws.
let createdWorkspaceId: string | null = null;
let prefTrack: { userId: string, prior: boolean | 'absent' } | null = null;

describeOrSkip('BK-214 — bunkai_notification_digest_candidates (membership, retention, preference, entity-availability)', () => {
  beforeAll(async () => {
    const db = service();

    const probe = await db.rpc(RPC);
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}: ${probe.error.message}). Apply migration 0078_notification_digest_log.sql.`;
      return;
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    const distinctIds = [...new Set((members ?? []).map(m => m.user_id as string))];
    if (distinctIds.length < 4) {
      skipReason = 'need at least 4 distinct real user ids among active workspace members (seed state).';
      return;
    }
    // Four DISTINCT recipients, one per exclusion reason under test — sharing
    // a recipient across scenarios was tried first and broke: flipping one
    // member to 'suspended' (or disabling one preference) silently excluded
    // every OTHER row seeded for that same member, not just the row meant to
    // prove that one exclusion.
    const [ownerUserId, memberBaseline, memberRevoked, memberPrefDisabled] = distinctIds;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;
    createdWorkspaceId = workspaceId;

    const { error: seedMembersError } = await db
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceId, user_id: memberBaseline, role: 'member', status: 'active' },
        { workspace_id: workspaceId, user_id: memberRevoked, role: 'member', status: 'active' },
        { workspace_id: workspaceId, user_id: memberPrefDisabled, role: 'member', status: 'active' },
      ]);
    if (seedMembersError) { throw seedMembersError; }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    const projectId = project.id as string;

    const { data: module, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: projectId, path: `${PREFIX}-module`, name: `${PREFIX} module` })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    const { data: bug, error: bugError } = await db
      .from('bugs')
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        module_id: module.id as string,
        title: `${PREFIX} bug`,
        severity: 'P2',
        created_by: ownerUserId,
      })
      .select('id')
      .single();
    if (bugError) { throw bugError; }
    const bugId = bug.id as string;

    // Snapshot memberPrefDisabled's real bug_lifecycle/email preference so
    // the "explicit disable" case can restore it afterward instead of
    // destroying whatever this shared live user actually had set (mirrors
    // notification-preferences-write-path.test.ts's own snapshot/restore).
    const { data: existingPref } = await db
      .from('notification_preferences')
      .select('enabled')
      .eq('user_id', memberPrefDisabled)
      .eq('event_type', 'bug_lifecycle')
      .eq('channel', 'email')
      .maybeSingle();
    prefTrack = { userId: memberPrefDisabled, prior: existingPref ? (existingPref.enabled as boolean) : 'absent' };

    await db
      .from('notification_preferences')
      .upsert({ user_id: memberPrefDisabled, event_type: 'bug_lifecycle', channel: 'email', enabled: false }, { onConflict: 'user_id,event_type,channel' });

    // Every row explicitly carries the SAME key set (created_at/read_at
    // included, even when the value is just "now"/null) — PostgREST's bulk
    // insert derives its column list from the union of keys across the
    // array, so a row that omits a key present on a sibling row gets that
    // column sent as an explicit `null` rather than falling through to the
    // table's default, which trips e.g. `created_at`'s not-null constraint.
    const notifRow = (marker: string, recipientUserId: string, extra: Record<string, unknown>) => ({
      workspace_id: workspaceId,
      recipient_user_id: recipientUserId,
      event_type: 'bug.assigned',
      entity_type: 'bug',
      entity_id: bugId,
      payload: { marker },
      created_at: new Date().toISOString(),
      read_at: null,
      ...extra,
    });

    const { data: seeded, error: seedError } = await db
      .from('notifications')
      .insert([
        notifRow(`${PREFIX}-baseline`, memberBaseline, {}),
        notifRow(`${PREFIX}-already-read`, memberBaseline, { read_at: new Date().toISOString() }),
        notifRow(`${PREFIX}-retained-89d`, memberBaseline, { created_at: daysAgo(89) }),
        notifRow(`${PREFIX}-retention-91d`, memberBaseline, { created_at: daysAgo(91) }),
        notifRow(`${PREFIX}-entity-unavailable`, memberBaseline, { entity_id: NONEXISTENT_ENTITY_UUID }),
        notifRow(`${PREFIX}-non-digest-event-type`, memberBaseline, { event_type: 'bug.filed' }),
        notifRow(`${PREFIX}-membership-revoked`, memberRevoked, {}),
        notifRow(`${PREFIX}-pref-disabled`, memberPrefDisabled, {}), // memberPrefDisabled's bug_lifecycle/email is now disabled
      ])
      .select('id, payload');
    if (seedError) { throw seedError; }

    const byMarker = (suffix: string) =>
      (seeded ?? []).find(n => (n.payload as { marker: string }).marker === `${PREFIX}-${suffix}`)!.id as string;

    fixture = {
      workspaceId,
      memberBaseline,
      memberRevoked,
      memberPrefDisabled,
      bugId,
      notifIds: {
        baseline: byMarker('baseline'),
        alreadyRead: byMarker('already-read'),
        retained89d: byMarker('retained-89d'),
        retention91d: byMarker('retention-91d'),
        membershipRevoked: byMarker('membership-revoked'),
        prefDisabled: byMarker('pref-disabled'),
        entityUnavailable: byMarker('entity-unavailable'),
        nonDigestEventType: byMarker('non-digest-event-type'),
      },
    };

    // Flip AFTER seeding so the row genuinely exists under active membership
    // first, matching how a real revoke-after-notify sequence would occur.
    const { error: revokeError } = await db
      .from('workspace_members')
      .update({ status: 'suspended' })
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberRevoked);
    if (revokeError) { throw revokeError; }
  });

  afterAll(async () => {
    const db = service();
    // Keyed on the incrementally-set trackers, not `fixture` — a throw
    // partway through beforeAll (after the preference upsert but before
    // `fixture` is assigned) must still restore the real user's preference
    // row and drop the throwaway workspace, or a crash here permanently
    // pollutes shared live data (see the migration/PR history: exactly this
    // happened once during authoring — a crashed run before this fix left a
    // real user's `bug_lifecycle`/`email` preference stuck on `false`).
    if (prefTrack) {
      if (prefTrack.prior === 'absent') {
        await db.from('notification_preferences').delete().eq('user_id', prefTrack.userId).eq('event_type', 'bug_lifecycle').eq('channel', 'email');
      }
      else {
        await db.from('notification_preferences').update({ enabled: prefTrack.prior }).eq('user_id', prefTrack.userId).eq('event_type', 'bug_lifecycle').eq('channel', 'email');
      }
    }
    if (createdWorkspaceId) {
      // workspaces.id cascades to notifications/workspace_members/projects/
      // modules/bugs (0001/0002/0046) — deleting the workspace alone is
      // sufficient, mirroring list-notifications-isolation.test.ts.
      await db.from('workspaces').delete().eq('id', createdWorkspaceId);
    }
  });

  function warn(): void {
    console.warn(`[skipped] ${skipReason ?? 'fixture setup did not complete'}`);
  }

  it('returns exactly the rows that should survive membership + retention + preference + entity + event-type filtering', async () => {
    if (!fixture) { return warn(); }

    // Filter server-side: the shared DB holds more candidates than PostgREST's
    // 1000-row cap, so an unfiltered read can drop this fixture's rows.
    const { data, error } = await service().rpc(RPC).eq('workspace_id', fixture.workspaceId);
    expect(error).toBeNull();

    const rows = ((data ?? []) as CandidateRow[]).filter(r => r.workspace_id === fixture!.workspaceId);
    const ids = new Set(rows.map(r => r.notification_id));

    expect(ids.has(fixture.notifIds.baseline)).toBe(true);
    expect(ids.has(fixture.notifIds.retained89d)).toBe(true);

    expect(ids.has(fixture.notifIds.alreadyRead)).toBe(false);
    expect(ids.has(fixture.notifIds.retention91d)).toBe(false);
    expect(ids.has(fixture.notifIds.membershipRevoked)).toBe(false);
    expect(ids.has(fixture.notifIds.prefDisabled)).toBe(false);
    expect(ids.has(fixture.notifIds.entityUnavailable)).toBe(false);
    expect(ids.has(fixture.notifIds.nonDigestEventType)).toBe(false);

    const baseline = rows.find(r => r.notification_id === fixture!.notifIds.baseline)!;
    expect(baseline.recipient_user_id).toBe(fixture.memberBaseline);
    expect(baseline.project_id).toBeTruthy();
    expect(baseline.entity_type).toBe('bug');
  });
});

// ============================================================================
// BK-1217 — email-only rows are digested once (migration 0107)
// ============================================================================
//
// AI Product Owner decision 13138 rule 2: with In-app off and Email on, the
// event appears in the next daily digest ONCE. 0107 adds
// `and (not n.in_app_suppressed or n.emailed_at is null)`; the runner stamps
// `emailed_at` after a successful send (send-digest-run.ts, unit-tested in
// send-digest-run.test.ts). This block is the DB oracle the PO accepted while
// Resend is down: it seeds rows directly with the service role (the function
// is service_role only) and stamps `emailed_at` exactly the way the runner
// does.
//
// RECIPIENT. The digest joins `auth.users ... u.email is not null`, so a
// recipient without an email would make an inclusion assertion fail for the
// wrong reason, and an exclusion assertion pass for the wrong reason.
// `auth.users` is not reachable through PostgREST and the admin user APIs are
// off-limits to tests (live-ui-identity.md §3), so instead of borrowing a user
// whose email cannot be checked, the recipient is the declared automation
// identity QA_E2E: it signs in by email and password, so it has an email by
// construction. Its user id comes from that real sign-in; no session is used
// for the RPC itself. QA_E2E's bug_lifecycle preferences are forced to
// "email on" after a snapshot and restored in afterAll even if setup fails
// partway; a failed restore FAILS the suite. The Email-off case flips QA_E2E's
// email channel off LAST and reuses a row the same test first proves is
// included, so its exclusion can only come from the preference.
//
// FAIL-CLOSED GATE (precedent: lib/runs/compare-isolation.test.ts): SKIPPED,
// loudly, only when there is no database environment or the
// `in_app_suppressed` column does not exist yet (0107 not applied). Anything
// else (missing automation identity, failed login, seed failure, an unexpected
// probe answer) FAILS, and every test asserts at least once.

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

let suppressionDeployed = false;
if (hasServiceEnv) {
  const probe = await service().from('notifications').select('id, in_app_suppressed, emailed_at').limit(1);
  const code = probe.error?.code ?? 'no error';
  if (!probe.error) {
    suppressionDeployed = true;
  }
  else if (code === '42703' || code === 'PGRST204') {
    console.warn(`[notification-digest-candidates-isolation] BK-1217 block SKIPPED: notifications.in_app_suppressed does not exist (${code}). Apply migration 0107_notification_inapp_suppression.sql. No BK-1217 assertion in this file ran.`);
  }
  else {
    throw new Error(`[notification-digest-candidates-isolation] unexpected answer from the BK-1217 column probe (${code}: ${probe.error.message}). Expected success (deployed) or 42703 (column missing).`);
  }
}
const describeIfSuppressionDeployed = hasServiceEnv && suppressionDeployed ? describe : describe.skip;

const ONCE_PREFIX = `bk1217-digest-once-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface PreferenceRow { event_type: string, channel: string, enabled: boolean }
interface OnceFixture {
  workspaceId: string
  deletedWorkspaceId: string
  qaUserId: string
  ids: Record<'suppressedFresh' | 'suppressedEmailed' | 'visible' | 'visibleWithStamp' | 'suppressedForEmailOff' | 'suppressedDeletedWorkspace', string>
}

let onceFixture: OnceFixture | null = null;
const onceWorkspaceIds: string[] = [];
let oncePrefsSnapshot: { userId: string, rows: PreferenceRow[] } | null = null;

function needOnceFixture(): OnceFixture {
  if (!onceFixture) {
    throw new Error('[notification-digest-candidates-isolation] the BK-1217 fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return onceFixture;
}

function onceMust<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[notification-digest-candidates-isolation] BK-1217 fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

async function setQaBugEmail(userId: string, enabled: boolean) {
  const { error } = await service()
    .from('notification_preferences')
    .upsert({ user_id: userId, event_type: 'bug_lifecycle', channel: 'email', enabled }, { onConflict: 'user_id,event_type,channel' });
  if (error) { throw new Error(`[notification-digest-candidates-isolation] could not set QA_E2E bug_lifecycle email to ${enabled}: ${error.message}`); }
}

async function candidateIdsFor(workspaceIds: string[]) {
  // Server-side filter: see the PostgREST 1000-row cap note in the BK-214 block.
  const { data, error } = await service().rpc(RPC).in('workspace_id', workspaceIds);
  expect(error).toBeNull();
  return new Set(((data ?? []) as CandidateRow[]).filter(r => workspaceIds.includes(r.workspace_id)).map(r => r.notification_id));
}

describeIfSuppressionDeployed('BK-1217 — bunkai_notification_digest_candidates digests an email-only row once', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[notification-digest-candidates-isolation] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present: the BK-1217 recipient must be an identity known to have an email.');
    }
    const client = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[notification-digest-candidates-isolation] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();

    // Snapshot BEFORE any mutation, so afterAll can always restore it.
    const { data: existing, error: existingError } = await db
      .from('notification_preferences')
      .select('event_type, channel, enabled')
      .eq('user_id', qaUserId)
      .eq('event_type', 'bug_lifecycle');
    if (existingError) { throw new Error(`[notification-digest-candidates-isolation] could not snapshot QA_E2E preferences: ${existingError.message}`); }
    oncePrefsSnapshot = { userId: qaUserId, rows: (existing ?? []) as PreferenceRow[] };
    await setQaBugEmail(qaUserId, true);

    // The owner is only the workspaces.owner_user_id FK (never a recipient),
    // so its email does not matter.
    const owner = onceMust(await db.from('workspace_members').select('user_id').eq('status', 'active').neq('user_id', qaUserId).limit(1).maybeSingle(), 'borrowed owner');
    const ownerUserId = owner.user_id as string;

    // Two workspaces: a live one, and one soft-deleted after seeding (BK-991).
    const seedWorkspace = async (suffix: string) => {
      const ws = onceMust(await db.from('workspaces').insert({ slug: `${ONCE_PREFIX}-${suffix}`, name: `${ONCE_PREFIX} ${suffix}`, owner_user_id: ownerUserId }).select('id').single(), `workspace ${suffix}`);
      const workspaceId = ws.id as string;
      onceWorkspaceIds.push(workspaceId);
      onceMust(await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'member', status: 'active' }).select('user_id').single(), `membership ${suffix}`);
      const project = onceMust(await db.from('projects').insert({ workspace_id: workspaceId, slug: `${ONCE_PREFIX}-${suffix}-p`, name: `${ONCE_PREFIX} ${suffix} project` }).select('id').single(), `project ${suffix}`);
      const moduleRow = onceMust(await db.from('modules').insert({ project_id: project.id, path: `${ONCE_PREFIX}-${suffix}-m`, name: `${ONCE_PREFIX} ${suffix} module` }).select('id').single(), `module ${suffix}`);
      const bug = onceMust(await db.from('bugs').insert({
        workspace_id: workspaceId,
        project_id: project.id,
        module_id: moduleRow.id,
        title: `${ONCE_PREFIX} ${suffix} bug`,
        severity: 'P2',
        created_by: ownerUserId,
      }).select('id').single(), `bug ${suffix}`);
      return { workspaceId, bugId: bug.id as string };
    };
    const live = await seedWorkspace('live');
    const doomed = await seedWorkspace('deleted');

    const row = (marker: string, target: { workspaceId: string, bugId: string }, extra: { in_app_suppressed: boolean, emailed_at: string | null }) => ({
      workspace_id: target.workspaceId,
      recipient_user_id: qaUserId,
      event_type: 'bug.assigned',
      entity_type: 'bug',
      entity_id: target.bugId,
      payload: { marker },
      created_at: new Date().toISOString(),
      read_at: null,
      ...extra,
    });
    const yesterday = daysAgo(1);
    const seeded = onceMust(await db.from('notifications').insert([
      row('suppressedFresh', live, { in_app_suppressed: true, emailed_at: null }),
      row('suppressedEmailed', live, { in_app_suppressed: true, emailed_at: yesterday }),
      row('visible', live, { in_app_suppressed: false, emailed_at: null }),
      // emailed_at only gates suppressed rows: a visible unread row keeps
      // being digested daily (BK-214), whatever this column holds.
      row('visibleWithStamp', live, { in_app_suppressed: false, emailed_at: yesterday }),
      row('suppressedForEmailOff', live, { in_app_suppressed: true, emailed_at: null }),
      row('suppressedDeletedWorkspace', doomed, { in_app_suppressed: true, emailed_at: null }),
    ]).select('id, payload'), 'notifications');
    const byMarker = (marker: string) => (seeded as { id: string, payload: { marker: string } }[]).find(n => n.payload.marker === marker)!.id;

    onceMust(await db.from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', doomed.workspaceId).select('id').single(), 'soft-delete workspace');

    onceFixture = {
      workspaceId: live.workspaceId,
      deletedWorkspaceId: doomed.workspaceId,
      qaUserId,
      ids: {
        suppressedFresh: byMarker('suppressedFresh'),
        suppressedEmailed: byMarker('suppressedEmailed'),
        visible: byMarker('visible'),
        visibleWithStamp: byMarker('visibleWithStamp'),
        suppressedForEmailOff: byMarker('suppressedForEmailOff'),
        suppressedDeletedWorkspace: byMarker('suppressedDeletedWorkspace'),
      },
    };
  });

  afterAll(async () => {
    const db = service();
    // Every step runs even if an earlier one fails; any failure is thrown at
    // the end, because a silently failed restore would leave QA_E2E with a
    // lifecycle channel off and poison QA's BK-213 retests.
    const failures: string[] = [];
    const step = async (what: string, op: PromiseLike<{ error: { message: string } | null }>) => {
      try {
        const { error } = await op;
        if (error) { failures.push(`${what}: ${error.message}`); }
      }
      catch (err) {
        failures.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    if (oncePrefsSnapshot) {
      const { userId, rows } = oncePrefsSnapshot;
      await step('delete QA_E2E bug_lifecycle preferences', db.from('notification_preferences').delete().eq('user_id', userId).eq('event_type', 'bug_lifecycle'));
      if (rows.length > 0) {
        await step('restore QA_E2E bug_lifecycle preferences', db.from('notification_preferences').insert(rows.map(r => ({ user_id: userId, ...r }))));
      }
    }
    if (onceWorkspaceIds.length > 0) {
      // Cascades cover members/projects/modules/bugs/notifications.
      await step('delete BK-1217 workspaces', db.from('workspaces').delete().in('id', onceWorkspaceIds));
    }
    if (failures.length > 0) {
      throw new Error(`[notification-digest-candidates-isolation] BK-1217 cleanup failed: ${failures.join('; ')}`);
    }
  });

  it('includes unemailed email-only rows and every visible unread row; excludes emailed and deleted-workspace email-only rows', async () => {
    const fx = needOnceFixture();
    const ids = await candidateIdsFor([fx.workspaceId, fx.deletedWorkspaceId]);

    expect(ids.has(fx.ids.suppressedFresh)).toBe(true);
    expect(ids.has(fx.ids.suppressedForEmailOff)).toBe(true);
    expect(ids.has(fx.ids.visible)).toBe(true);
    expect(ids.has(fx.ids.visibleWithStamp)).toBe(true);

    expect(ids.has(fx.ids.suppressedEmailed)).toBe(false);
    expect(ids.has(fx.ids.suppressedDeletedWorkspace)).toBe(false);
  });

  it('once the runner stamps emailed_at, the email-only row leaves the set while the visible row is re-included', async () => {
    const fx = needOnceFixture();
    // Exactly the runner's stamp (send-digest-run.ts): ids of the user's
    // candidates, filtered on in_app_suppressed = true.
    const { error } = await service()
      .from('notifications')
      .update({ emailed_at: new Date().toISOString() })
      .in('id', [fx.ids.suppressedFresh, fx.ids.visible])
      .eq('in_app_suppressed', true);
    expect(error).toBeNull();

    const ids = await candidateIdsFor([fx.workspaceId]);
    expect(ids.has(fx.ids.suppressedFresh)).toBe(false);
    expect(ids.has(fx.ids.visible)).toBe(true);

    const { data: visible } = await service().from('notifications').select('emailed_at').eq('id', fx.ids.visible).single();
    expect(visible!.emailed_at).toBeNull();
  });

  // Deliberately LAST: it turns QA_E2E's bug email channel off.
  it('an unemailed email-only row is excluded once its recipient turns the Email channel off', async () => {
    const fx = needOnceFixture();
    const before = await candidateIdsFor([fx.workspaceId]);
    expect(before.has(fx.ids.suppressedForEmailOff)).toBe(true);

    await setQaBugEmail(fx.qaUserId, false);
    const after = await candidateIdsFor([fx.workspaceId]);
    expect(after.has(fx.ids.suppressedForEmailOff)).toBe(false);
  });
});
