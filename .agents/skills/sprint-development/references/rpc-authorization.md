# RPC authorization: actor bind and result scoping

This binds any story that writes or changes a Postgres function taking a caller-supplied identity or scope parameter. Read it during Stage 1 planning, not at review time.

The failure below is a shape of code that looks correct and is not. It has shipped repeatedly, in different projects, written by competent people following the process, and an adversarial review that went looking for it specifically caught it, when anything did. Treat it as a checklist item, because intuition will not flag it.

---

## 1. The failure

A `SECURITY DEFINER` function runs with the definer's privileges, and **RLS does not apply to it**. The definer is typically a role carrying `bypassrls`, and RLS is also skipped for a table's own owner unless that table declares `FORCE ROW LEVEL SECURITY`. Check which is true of your schema before relying on either, because most schemas declare it nowhere.

So inside a DEFINER function a `WHERE` clause is a selection filter, not an authorization check. It decides which rows come back. It does not decide whether the caller may ask.

Two things must be proven, and they fail independently.

**Actor bind: is the caller who they claim to be?** A function taking an actor parameter is being told an identity by the caller. Under the public/anon key with a real session, `auth.uid()` is the truth and the parameter is a claim. If nothing compares them, any signed-in user can pass another member's id and act as them.

**Result scoping: are the returned rows inside the caller's boundary?** Asserting the caller's own membership does not scope what comes back. A function can correctly verify "you are a member of tenant X" and still return rows from outside X, because the membership assert and the returned set are two different queries.

### The recurring pattern

Three observed instances, anonymized: one project, one day, three tickets, three authors.

| Caught at | What was wrong |
| --- | --- |
| Planning, before any code | A proposed DEFINER function filtered on a caller-supplied tenant id with no membership assert at all. Caught only because someone adversarially reviewed the proposal. |
| In production, live | A function asserted the caller's own membership, then never scoped the returned rows to it. Any user could self-provision a tenant and read another user's account records. It stayed live on the shared database until a follow-up migration fixed it. |
| Review, pre-merge | A brand-new write function had no actor bind, while its sibling function a few lines below in the same file had the correct one. Any signed-in user could attribute a write to another real member. |

In the second case the membership assert was present and correct. That is why this needs a checklist: "I checked membership" feels like the job is done.

---

## 2. First ask whether it needs DEFINER at all

`SECURITY DEFINER` is an escalation. A neighbouring migration using it is not a reason to reach for it.

Use `SECURITY INVOKER` and let the caller's own RLS-scoped client do the work, unless the function genuinely needs one of:

- transactional integrity across several statements that must succeed or fail together, or
- reading a table the caller's role legitimately cannot see (the auth provider's own user table is the usual real example).

When the project has an ADR governing the data-access model (`SECURITY DEFINER` RPC versus direct RLS-scoped table access), read it before deciding. That choice is architectural and is normally already settled. Record the answer in the plan either way.

**The strongest fix is deleting the parameter.** Redesigning to `SECURITY INVOKER` with no actor parameter removes the whole class of bug instead of guarding against it: a function that cannot be told who the caller is cannot be lied to. Try that before a guard.

---

## 3. If it needs DEFINER, both guards are mandatory

### Actor bind: the canonical shape

Use this shape, substituting your own parameter and error names:

```sql
-- 0. Actor bind. A NULL auth.uid() means the service-role / admin client (a trusted
--    server-side caller), for which the parameter IS the only identity available. A
--    present but different uid is a spoof attempt.
if auth.uid() is not null and auth.uid() <> <actor_param> then
  raise exception '<same_error_as_not_found>' using errcode = '<same_errcode_as_not_found>';
end if;
```

Three choices in it are deliberate:

- **`auth.uid() is not null` is not a loophole.** The service-role client carries no `sub`, so `auth.uid()` is NULL and the parameter is the only identity that exists. Under the public/anon key with a real session it is populated and authoritative. If your project never calls the function from a trusted server-side client, drop the null branch and bind unconditionally, which is strictly safer.
- **It raises the same error as "not found".** A distinct "forbidden" code turns the function into an oracle for which `(actor, resource)` pairs exist. Non-disclosure is the point.
- **It runs at step 0**, before any table read, so nothing leaks through a later branch.

### Result scoping

Every query whose rows leave the function must itself be constrained to the boundary you asserted. Write the assert and the scoping as two separate, visible steps. When you catch yourself thinking "the membership check above already covers this", that is the live-in-production mistake from §1, verbatim.

---

## 4. Authoring checklist

Answer all six in the Stage 1 plan's Technical Decisions, before writing SQL:

1. Does this need `SECURITY DEFINER`, or does `SECURITY INVOKER` do it? Cite the governing ADR if one exists.
2. Can the identity parameter be removed entirely instead of guarded?
3. If it stays, where is the actor bind, and is it at step 0?
4. Which returned rows cross a tenant boundary, and what constrains each one?
5. Does the failure path use the same error as "not found", or does it disclose existence?
6. Which test proves both properties against the real database, not a mock?

---

## 5. The test that proves it

**A route test that mocks the RPC call proves nothing about the function.** One of the §1 incidents shipped an RPC that raised a hard type-mismatch error on every real invocation: the declared return type did not match the underlying column type, and `RETURN QUERY` requires an exact match. It stayed invisible while it was live because the suite mocked the call. A green suite is not evidence that the database path ever ran.

Write a DB-integration test that authenticates as a real session and attempts the attack. Follow the identity contract in `live-ui-identity.md`: sign in through the app's real password or OAuth path as the project's declared automation identity, then spoof only the RPC's actor parameter with a uuid belonging to nobody. Do not mint a JWT and do not impersonate. The guard fires before any table read, so no second account needs provisioning. The service role stays in the test for fixture seed and teardown only, which is sanctioned because it obtains no session.

Cover at least these cases: the legitimate caller still works, a spoofed actor id is rejected, and a foreign tenant's rows never appear in the result.

---

## 6. Assume the guard is missing until you have read it

In a codebase that has not been audited for this, the default is that the guard is absent. The pattern only appears where someone retrofitted it after finding the vulnerability, so a neighbouring migration does not show that the convention is established.

Two consequences:

- **For the function you are writing**, assume it lacks the guard until you have read the line that proves otherwise.
- **For the functions you are not writing**, a broad pre-existing gap is a remediation item of its own, tracked separately. Do not fix it inline from an unrelated story. Record what you found, size it as its own work, and stay in scope.

When auditing, separate the two failure modes by blast radius. A missing actor bind is an identity-integrity gap (a co-member attributing a write to another co-member). Missing result scoping is a tenant-isolation gap (data crossing a boundary), and it is the more urgent of the two.

---

## 7. Where this binds

- **Stage 1 (planning).** The six questions in §4 are answered in Technical Decisions before SQL is written. A DEFINER function with a caller-supplied identity or scope parameter and no answer to question 3 blocks Stage 2.
- **Stage 2 (implementation).** The DB-integration test from §5 ships in the same slice as the migration, not a later one.
- **Stage 3 (review).** The reviewer checks that the guard exists, sits at step 0, and is exercised by a test that runs against the real database. "Membership is asserted" is not sufficient, and result scoping is checked separately.
