# RPC authorization — actor bind and result scoping

Binding for any story that writes or changes a Postgres function taking a caller-supplied identity or
scope parameter. Read it during Stage 1 planning, not at review time.

This file exists because the same defect class shipped three times in a single day (2026-07-31) in
three different tickets, by three different workers, each of whom was competent and following the
process. It is not a discipline problem. It is a shape of code that looks correct and is not.

---

## 1. The failure

A `SECURITY DEFINER` function runs with the definer's privileges and **RLS does not apply to it**.
Verified for this codebase: there is no `FORCE ROW LEVEL SECURITY` anywhere in
`supabase/migrations/`. So inside a DEFINER function, a `WHERE` clause is a **selection filter**, not
an authorization check. It decides which rows come back. It does not decide whether the caller is
allowed to ask.

Two distinct things must be proven, and they fail independently:

**Actor bind — is the caller who they claim to be?**
A function taking `p_actor_user_id` is being told an identity by the caller. Under the anon key with
a real session, `auth.uid()` is the truth and the parameter is a claim. If nothing compares them, any
signed-in user can pass another member's id and act as them.

**Result scoping — are the rows returned inside the caller's boundary?**
Asserting the caller's own membership is not the same as scoping what comes back. A function can
correctly verify "you are a member of workspace X" and still return rows from outside X, because the
membership assert and the returned set are two different queries.

### The three incidents, so the shape is recognizable

| When | Where | What was wrong |
|---|---|---|
| BK-49, pre-code | proposed RPC in the Stage 1 plan | DEFINER function filtering on a caller-supplied `p_workspace_id` with no membership assert. Caught by an adversarial review of the PROPOSAL, before a line was written. |
| BK-49, live | `bunkai_resolve_activity_actors` | Asserted the caller's own membership, never scoped the RETURNED `auth.users` rows to it. Any user could self-provision a workspace and resolve any other user's email. Live on the shared project until migration `0047`. |
| BK-40, slice 1 | `bunkai_create_bug` | No actor bind. Any signed-in user could attribute a bug to another real member via the anon key. Caught in review before merge. |

Note the second one: the membership assert was present and correct. That is exactly why this needs a
checklist rather than intuition — "I checked membership" feels like the job is done.

---

## 2. First ask whether it needs DEFINER at all

`SECURITY DEFINER` is an escalation. Do not reach for it because a neighbouring migration used it.

Use `SECURITY INVOKER` and let the caller's own RLS-scoped client do the work, unless the function
genuinely needs one of:

- transactional integrity across multiple statements that must succeed or fail together, or
- reading a table the caller's role legitimately cannot see (`auth.users` is the real example here).

`ADR-0001` (Path A vs Path B) already governs this choice. Read it before deciding.
`bunkai_list_activity` (migration `0045`) is the worked example of the safe answer: it was
redesigned to `SECURITY INVOKER` with no actor parameter at all, which removes the entire class of
bug rather than guarding against it.

**The strongest fix is deleting the parameter.** A function that cannot be told who the caller is
cannot be lied to.

---

## 3. If it does need DEFINER, both guards are mandatory

### Actor bind — the canonical shape

Copy this. It is the shape in `0039_run_history_actor_guard.sql` and `0046_bugs.sql`:

```sql
-- 0. Actor bind. A NULL auth.uid() means the service-role / admin client (the API
--    route), for which the parameter IS the only identity available. A present but
--    different uid is a spoof attempt.
if auth.uid() is not null and auth.uid() <> p_actor_user_id then
  raise exception 'test_not_found' using errcode = 'P0002';
end if;
```

Three things about it that are deliberate:

- **`auth.uid() is not null` is not a loophole.** The service-role client carries no `sub`, so
  `auth.uid()` is NULL and the parameter is the only identity that exists. Under the anon key with a
  real session it is populated and authoritative.
- **It raises the SAME error as "not found."** A distinct "forbidden" code turns the function into an
  oracle for which `(actor, resource)` pairs exist. Non-disclosure is the point.
- **It runs at step 0**, before any table read, so nothing leaks through a later branch.

### Result scoping

Every query whose rows leave the function must itself be constrained to the boundary you asserted.
Write the assert and the scoping as two separate, visible steps. If you find yourself thinking "the
membership check above already covers this," that is the BK-49 mistake, verbatim.

---

## 4. Authoring checklist

Answer all six in the Stage 1 plan's Technical Decisions, before writing SQL:

1. Does this need `SECURITY DEFINER`, or does `SECURITY INVOKER` do it? Cite `ADR-0001`.
2. Can the identity parameter be removed entirely instead of guarded?
3. If it stays: where is the actor bind, and is it at step 0?
4. Which returned rows cross a tenant boundary, and what constrains each one?
5. Does the failure path use the same error as "not found," or does it disclose existence?
6. Which test proves both properties against the real database, not a mock?

---

## 5. The test that proves it

A route test that mocks `db.rpc` proves nothing about the function. BK-49 shipped an RPC that raised
`42804` on **every** real invocation — a hard type mismatch, invisible because the suite mocked the
call. A green suite is not evidence the database path was ever executed.

Write a DB-integration test that authenticates as a real session and attempts the attack. The two
reference implementations on `staging`:

- `lib/runs/report-isolation.test.ts`
- `lib/activity/list-activity-isolation.test.ts`

Both follow the identity contract in `live-ui-identity.md`: sign in through the app's real
`signInWithPassword` path as the declared `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD` identity, then
spoof only the RPC's `p_actor_user_id` **parameter** with a uuid belonging to nobody. Never mint a
JWT, never impersonate. The guard fires before any table read, so no second account has to be
provisioned. Service-role stays in the test for fixture seed and teardown only, which is sanctioned —
it obtains no session.

Cover at minimum: the legitimate caller still works, a spoofed actor id is rejected, and a foreign
tenant's rows never appear in the result.

---

## 6. Known debt — do not add to it

Audited on `origin/staging`, 2026-07-31: **16 of the 18 migrations that take `p_actor_user_id` have
no actor bind.** Only `0039_run_history_actor_guard.sql` (added as a retrofit after this exact
vulnerability was found in BK-37) and `0041_run_project_report.sql` have one. `0042_run_step_mark.sql`
merged the same day without one.

The blast radius is bounded: none of these let a caller cross a workspace boundary, so the exposure
is a co-member attributing a write to another co-member's identity, not cross-tenant access. It is
tracked as its own remediation item and is deliberately not something to fix inline from an unrelated
story.

What that number should tell you: this is the codebase's default outcome when nobody checks. Assume
your function is missing the guard until you have read the line that proves otherwise.

---

## 7. Where this binds

- **Stage 1 (planning)** — the six questions in §4 are answered in Technical Decisions before SQL is
  written. A DEFINER function with a caller-supplied identity or scope parameter and no answer to
  question 3 blocks Stage 2.
- **Stage 2 (implementation)** — the DB-integration test from §5 ships in the same slice as the
  migration, not a later one.
- **Stage 3 (review)** — the reviewer checks the guard exists, sits at step 0, and is exercised by a
  test that runs against the real database. "Membership is asserted" is not sufficient; result
  scoping is checked separately.
