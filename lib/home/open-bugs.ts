import type { BugSeverity } from '@lib/bugs/constants';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BUG_SEVERITY_VALUES } from '@lib/bugs/constants';
import { HOME_OPEN_BUG_STATUSES } from '@lib/home/constants';

// BK-258 — the workspace-level rollup behind Home's "Open bugs" stat card: how
// many defects are currently outstanding across every project in the workspace,
// and how many of those sit at each severity.
//
// Shared deliberately by BOTH `/api/v1/workspaces/{id}/open-bugs` and the Home
// server component, so the widget and the endpoint can never disagree about a
// number — the contract `lib/home/recent-projects.ts` (BK-257) established and
// `lib/home/active-runs.ts` (BK-256) repeated.
//
// WHAT "OPEN" MEANS
// -----------------
// `HOME_OPEN_BUG_STATUSES` (lib/home/constants.ts) is the single definition:
// `open` + `in_progress`, the two pre-resolution states of the shipped status
// lifecycle. The reasoning — and why the literal `open`-only reading was
// rejected — lives on that constant. This module never re-derives it, and the
// endpoint publishes the same list on the wire as `open_statuses` so an API
// caller reads the rule rather than inferring it from a number.
//
// WHY THE TOTAL IS THE SUM, NOT A FIFTH COUNT
// -------------------------------------------
// The AC requires the total and the breakdown to add up. Issuing a separate
// `count(*)` for the total would not guarantee that: five statements are five
// snapshots, and a bug filed between them lands in one and not the others, so
// the card could print a total its own chips contradict — on the one screen
// whose entire job is to be glanceable.
//
// So the total is DERIVED: `totalOpen = sum(bySeverity)`. This is exhaustive by
// schema, not by convention — `bugs.severity` carries a CHECK constraining it to
// exactly P1..P4 (0046_bugs.sql), the same four values `BUG_SEVERITY_VALUES`
// enumerates, so no open bug can fall outside the partition. Widening that CHECK
// in a future migration without adding the value here would make the total
// understate; the two live in one place each and the constant is the one the
// Zod layer and the RPC backstop already share.
//
// The four counts are still four statements, so a bug filed mid-flight is
// counted or not counted. That race is unavoidable without a snapshot
// transaction and harmless here: it can only ever move ONE severity by one, and
// the total moves with it, so the figures stay internally consistent — which is
// the property the AC actually asks for.
//
// WHY ARCHIVED MODULES ARE EXCLUDED
// ---------------------------------
// A bug hangs off exactly one module (`bugs.module_id` is NOT NULL, 0046), and
// every surface that LISTS bugs drops the ones whose own module is archived:
// `bunkai_list_bugs` (0051, Decision 12) and `bunkai_list_project_bugs` (0046)
// both inner-join `modules ... and m.archived_at is null`, and the defect
// heatmap (0052) does the same. `/api/v1/bugs` is project-scoped and goes
// through that RPC, so there is no other bug list anywhere in the product.
//
// Counting them here would therefore print a headline figure nobody can reach:
// archive a module holding three open defects and Home would assert twelve
// while every list, filter and heatmap cell in the app sums to nine, with no
// screen able to account for the gap. So this rollup applies the same rule its
// own lists apply — the widget stays reconcilable with the surfaces a lead
// checks it against, which is the only thing that makes the number actionable.
// It also matches the convention next door: `lib/home/recent-projects.ts`
// (BK-257) already excludes archived modules and ATCs from its per-project
// counts.
//
// The join is an INNER embed (`modules!inner(archived_at)`) with the filter on
// the embedded column, the same technique `lib/home/active-runs.ts` uses for
// `run_atcs!inner(run_id)` — Postgres does the join, and the filter constrains
// the `count` itself rather than just the (empty) body of a `head` request.
// `modules_select_workspace_member` (0002) scopes on the same active-membership
// test as `bugs_select_workspace_member`, so the added join cannot hide a row
// from a caller who was already entitled to count it.
//
// COST SHAPE
// ----------
// Four `head: true` counts — no rows cross the wire, and each rides
// `bugs_workspace_id_severity_unresolved_idx` (0061), a partial index whose
// predicate mirrors `HOME_OPEN_BUG_STATUSES` literally, so each count seeks
// straight to one severity's slice of the workspace's OUTSTANDING defects with
// no residual `status` filter. The module join then costs one `modules_pkey`
// probe per surviving bug — bounded by the outstanding defect load the card is
// displaying, not by the workspace's defect history, which is the property the
// index exists to buy. There is deliberately no scan ceiling: `count` is exact
// by construction, so unlike the row-scanning rollups next to it this one has
// no truncation point that could make a printed number a floor.
//
// RLS: every read runs through the caller's own client, so
// `bugs_select_workspace_member` (0046) scopes the counts to workspaces the
// caller actually belongs to — a forged `bk_active_ws` cookie pointing at
// someone else's workspace counts zero rather than leaking a defect posture.

export interface OpenBugsRollup {
  // Outstanding bugs across the whole workspace. Always equal to the sum of
  // `bySeverity` — see the derivation note above.
  totalOpen: number
  bySeverity: Record<BugSeverity, number>
}

// A read that FAILED is `ok: false`, never a zeroed rollup. Reporting "0 open
// bugs" to a lead whose workspace is full of them is the exact failure this
// screen exists to prevent, and it is the same line every other Home widget
// draws.
export type OpenBugsResult
  = { ok: true } & OpenBugsRollup
    | { ok: false };

interface CountOpenBugsParams {
  workspaceId: string
}

export async function countOpenBugs(
  db: SupabaseClient<Database>,
  params: CountOpenBugsParams,
): Promise<OpenBugsResult> {
  const openStatuses = [...HOME_OPEN_BUG_STATUSES];

  const counted = await Promise.all(
    BUG_SEVERITY_VALUES.map(async severity => ({
      severity,
      result: await db
        .from('bugs')
        .select('id, modules!inner(archived_at)', { count: 'exact', head: true })
        .eq('workspace_id', params.workspaceId)
        .eq('severity', severity)
        .in('status', openStatuses)
        .is('modules.archived_at', null),
    })),
  );

  const bySeverity = {} as Record<BugSeverity, number>;
  let totalOpen = 0;

  for (const { severity, result } of counted) {
    // A null `count` without an error is not zero — it is "the server did not
    // return one". Treating it as zero would print a confident figure derived
    // from an absent answer, so it fails the whole rollup like any other bad
    // read: one unreadable severity makes the total wrong too, and a total the
    // chips contradict is worse than an honest error state.
    if (result.error !== null || result.count === null) {
      return { ok: false };
    }
    bySeverity[severity] = result.count;
    totalOpen += result.count;
  }

  return { ok: true, totalOpen, bySeverity };
}
