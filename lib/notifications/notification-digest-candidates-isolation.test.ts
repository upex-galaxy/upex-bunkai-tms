import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

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

    const { data, error } = await service().rpc(RPC);
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
