# ADR-0011 — Activity Feed Actor Resolution: peer-visible `auth.users` lookup, scoped by co-membership

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Project architect (drafted by Worker B, AI, avalanche-2026-07, during BK-49 Stage 1 planning; accepted by the repo owner 2026-07-31, before Slice 3's UI made the exposure live)
- **Tags:** authentication, authorization, data-exposure, security-definer, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-49 (TMS Activity Stream) renders a workspace-wide feed of `activity_log` rows. Each row carries `actor_user_id`, and the feed must show a human-readable actor (name/email), not a raw UUID (AC1, Scenario 1.1). `auth.users` — where email lives — is **not exposed to PostgREST** on this project (confirmed: `0034_auth_email_status_rpc.sql` header, `PGRST106 "Only public, graphql_public are exposed"`), so resolving an arbitrary other user's id to an email requires a `SECURITY DEFINER` function that reads `auth.users` on the caller's behalf.

Every existing function of this shape is **self-only or service_role-only**:

- `settings/account/page.tsx:56-70` — resolves the CALLER's own email/last-sign-in via `createAdminClient().auth.admin.getUserById(user.id)`, called from a trusted server component, never exposed as a callable RPC to `authenticated`.
- `public.bunkai_user_id_by_email` (`0022_invite_integrity_user_lookup.sql`) — `revoke all ... from public, anon, authenticated`; callable only by `service_role`, from the invite-integrity check.
- `public.auth_email_status` (`0034_auth_email_status_rpc.sql`) — same shape: `revoke all ... from public, anon, authenticated; grant execute ... to service_role`.

In every prior case, a human user's browser session **never** directly triggers an `auth.users` read. The read either happens inside a trusted server component using the platform's own admin credentials (account page, self-only), or is walled off entirely behind `service_role` (invite integrity, login pre-check) and reached only through a server-side admin client the route itself controls.

BK-49 breaks that pattern by necessity. To label "who did this" for every row on a page, the feed needs to batch-resolve the **distinct `actor_user_id` values on that page** — which are, by construction, OTHER workspace members, not the caller. There is no existing multi-user email-resolution precedent to copy: item 5 of the Stage 1 canonical decision (Jira comment, 2026-07-31) requires a **new** narrow `SECURITY DEFINER` helper (`bunkai_resolve_activity_actors` or equivalent), scoped to co-membership in the same workspace as the caller, and — per ADR-0001's Path B doctrine (RLS/`principal.db` throughout, no admin client on this route) — it must be reachable via `db.rpc(...)` on the RLS-scoped client. That means `grant execute ... to authenticated`, not `service_role`-only.

## Decision

We will ship `bunkai_resolve_activity_actors(p_workspace_id uuid, p_user_ids uuid[]) returns table(user_id uuid, email text)` as a new `SECURITY DEFINER` function:

- **Grantable to `authenticated`** (the first `auth.users`-reading function in this codebase reachable directly by a normal signed-in user via PostgREST, not funneled through a trusted server-side admin client).
- Internally verifies `public.bunkai_is_workspace_member(p_workspace_id)` (the caller's own co-membership, via `auth.uid()` — same non-spoofable pattern as the module-mutation RPCs in `0023_module_activity_log.sql`, no explicit actor parameter needed) before touching `auth.users`.
- Returns ONLY `email` for the requested `p_user_ids` — no other `auth.users` columns (no `last_sign_in_at`, no `raw_user_meta_data`, no `phone`).
- Does not filter `p_user_ids` by co-membership per-id: every `actor_user_id` on an `activity_log` row is already guaranteed (by the row's own workspace-scoped write path) to have been an active member of `p_workspace_id` at write time. The caller-side check is what's new; the target ids are already workspace-scoped by construction.

This is a **posture change**: any active member of a workspace (including `viewer` role, per BK-49's scope — RLS `activity_log_select_workspace_member` admits any active role) can now trigger an `auth.users` lookup that discloses a co-member's email, directly from the browser, without going through a server-controlled admin client. Previously, the only way a browser session could learn another user's email was indirectly, through already-existing invite/membership UI built on `service_role`-gated RPCs the client never calls directly.

## Consequences

- **Positive:**
  - Unblocks AC1 (actor display) without inventing a bespoke non-RPC mechanism or reverting to an admin-client route (which item 1's ADR-0001 Path B decision already ruled out for this feature).
  - Narrow surface: one function, one column (`email`), explicit `p_user_ids` allowlist (never "give me everyone"), workspace-scoped.
  - Batch-friendly: one call resolves every distinct actor on a page, avoiding N+1 admin-client calls.
  - Establishes a reusable pattern (`SECURITY DEFINER` + `auth.uid()`-internal co-membership check, granted to `authenticated`) for any future feature that needs peer-visible identity resolution (e.g. Notifications Center BK-208, Team Chat BK-210 — both already on the roadmap and will need the same shape).

- **Negative / trade-offs:**
  - Any workspace member (including viewers) can now learn the email of any co-member who has ever written an `activity_log` row, directly via PostgREST — a strictly broader disclosure surface than the `service_role`-only precedents (`0022`, `0034`) or the self-only precedent (`settings/account`). This is a real, intentional widening of who can read `auth.users`-derived PII and by what path, not merely an implementation detail.
  - No opt-out: a user cannot hide their email from co-members' activity-feed view (no existing "hide my email" preference in this codebase to gate on). Consistent with existing workspace-membership norms (workspace member lists already show other members) but not identical — this is the first time `auth.users` email specifically, rather than a `workspace_members`-adjacent profile field, is disclosed this way.
  - Adds one more `SECURITY DEFINER` function to the audit surface; every future reviewer must re-verify the co-membership check on this function specifically (it is not covered by RLS — RLS is bypassed entirely inside a DEFINER function).

- **Neutral / follow-ups:**
  - If BK-208 (Notifications) or BK-210 (Team Chat) land later and need the same actor-resolution shape, they should reuse this function (or a generalized sibling) rather than hand-rolling a third variant — flag at that point.
  - If the product later adds a "hide email from workspace" preference, this function's `select` must be revisited to honor it.
  - **BK-264 (Slice 4, 2026-08-03) — call site widened to a payload-embedded id; verified safe, flagged per this ADR's own instruction.** `fetchActivityPage` (`app/api/v1/activity/response.ts`) now batches TWO id sources into the SAME `bunkai_resolve_activity_actors` call: each row's own `actor_user_id` (this ADR's original scope) PLUS, for `bug.assigned` / `bug.reassigned` rows only, the NEW assignee id read out of `payload.assignee_user_id` (set by `bunkai_assign_bug`, migration `0054_bug_assignment_status.sql`). This is exactly the "boundary, not silent fix" this ADR's own Decision anticipated widening into, and STORY-BK-264's ratified Stage 1 Technical Decision 6 had committed to flat, non-interpolated activity labels ("assigned a defect", "changed a defect status") specifically to avoid it. Slice 4 shipped full name interpolation instead (`"{actor} assigned this defect to {assignee}"`, `lib/activity/labels.ts`) because the story's own AC scenarios literally quote names in their expected activity strings — the flat-label Decision 6 was, in hindsight, inconsistent with the AC it was meant to satisfy. Verified safe (code review, 2026-08-03): `bunkai_assign_bug` only ever writes `assignee_user_id` after checking that user's `workspace_members` row is `active` in THIS bug's own `workspace_id` (migration 0054 step 4) — the identical "workspace-member-at-write-time" guarantee this ADR's Decision already relies on for `actor_user_id` (third bullet above). No further action needed; recorded here per this ADR's own "flag at that point" instruction, not reverted (reverting would break the AC).

## Alternatives considered

- **Route the lookup through a server-only admin-client helper** (mirrors `settings/account/page.tsx`), never exposing an RPC to `authenticated`. Rejected: `settings/account` reads only the CALLER's own id; there the caller and the subject are the same person, so no cross-user disclosure occurs. BK-49 must resolve OTHER users' ids in bulk — that lookup would still need to happen somewhere, and moving it into the API route (which per item 1's ADR-0001 Path B decision runs on `principal.db`, not an admin client) would mean introducing an admin client into this one route specifically, re-opening the exact RLS-bypass surface item 1 deliberately closed for the read RPC. Narrower to keep the admin client out entirely and push the one unavoidable privileged read into a purpose-built, workspace-scoped DEFINER function.
- **Denormalize a display name/email snapshot onto `activity_log` at write time** (store `actor_email` in the row, like `module.renamed`'s payload snapshots parts of its own mutation). Rejected for this story: touches every existing writer (12 call sites across 9 migrations) to add a column and backfill, is explicitly out of this story's 5sp bounded scope ("no new event writers within this story" — PO-proxy estimate), and freezes a point-in-time email into permanent history (an email change would silently desync past rows from the live account) — a bigger, differently-shaped decision than this story is scoped to make.
- **Do not resolve actor identity at all; show only a stable pseudonymous marker** (e.g. `actor_user_id` truncated, like Run History's `run.id.slice(0, 8)`). Rejected: fails AC1 Scenario 1.1's explicit requirement ("each visible entry shows actor... ") and the story's stated business value ("who did it").

## References

- `.context/PBI/epics/EPIC-BK-44-coverage-traceability/stories/STORY-BK-49-tms-activity-stream-a-read-side-feed-over-the-exis/comments.md` — item 4 (Actor + item display) of the 2026-07-31 canonical resolution.
- `ADR-0001-unified-api-authentication.md` — Path B (impersonating/RLS-scoped client) doctrine this ADR builds on for the READ RPC; this ADR covers the one function that deliberately steps outside Path B (DEFINER, because `auth.users` genuinely needs the escalation).
- `supabase/migrations/0022_invite_integrity_user_lookup.sql`, `0034_auth_email_status_rpc.sql` — the `service_role`-only precedents this ADR departs from.
- `app/(app)/settings/account/page.tsx:56-70` — the self-only admin-client precedent this ADR departs from.
- `supabase/migrations/0023_module_activity_log.sql` — the `SECURITY DEFINER` + internal `auth.uid()` (no explicit actor param) pattern this ADR's function follows.
- `supabase/migrations/0005_rls_helpers.sql` — `bunkai_is_workspace_member`, the co-membership check this ADR's function calls.

<!--
Authoring notes (delete this comment in the real ADR):
- Filename: ADR-<NNNN>-<kebab-slug>.md  (4-digit number, never reused).
- Add a row to .context/ADR/README.md → Index after creating this file.
- Append-only: once Accepted, do not rewrite the Decision/Consequences. To change course,
  write a NEW ADR that Supersedes this one and flip this file's Status + Superseded-by line.
- Only ADR-worthy decisions belong here: architectural AND hard to reverse. Story-local
  trade-offs stay in the story's implementation-plan.md. See .context/ADR/README.md.
-->
