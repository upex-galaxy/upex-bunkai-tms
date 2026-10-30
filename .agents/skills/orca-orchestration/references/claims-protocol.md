# Claims Protocol — Shared Data, Schema and Identities

> Loaded by: the conductor (it arbitrates) and every worker (it declares).
> There is no claim command and no lock daemon. A claim is a MESSAGE with a reserved subject
> prefix, and the conductor keeps the ledger. That is deliberate: a file-based lock in a fleet
> spread over several worktrees needs a shared filesystem, a TTL, crash recovery and an atomic
> write — four moving parts to replace one conductor who is already awake and already arbitrating.

---

## 1 · What is claimable, and what is not

A claim covers a **shared mutable resource that two workers could touch at once**: in a delivery
fleet that is mostly the shared staging database and the shared automation identity. It does NOT cover
files: file collisions are prevented at assignment time by file ownership (`references/topologies.md`),
not at runtime.

| Entity | Id shape | Typical intent | Why it collides |
|---|---|---|---|
| `identity` | the `testing.automation_identity` slot plus environment | `write` (a live browser session or a state change on that account), `read` (login only) | one identity = one live browser: two workers logging in as the same account invalidate each other's session (`sprint-development/references/live-ui-validation.md` §3) |
| `seed` | the seed or dataset name | `write` | one worker mutates the rows another is validating against |
| `record` | `<table>:<id>` of a real row | `write` | the classic dirty read across two sessions |
| `schema` | the database (`staging-db`) or one table | `write` = apply a migration, `read` = rely on the current shape | a migration applied under a worker changes what its code, its generated types and its tests see. Applying one is conductor-only (`references/coordinator-playbook.md` §7); a worker claims `read` and lets the conductor sequence the writes |
| `env-resource` | feature flag / storage bucket / deploy-platform env var / queue | `write` | a flag or a Vercel env var changed for one worker changes another's build or behaviour |
| `tracker-artifact` | the issue key | `write` | two writers on one description or one custom field overwrite each other wholesale |

Three intents:

- **`read`** — I will not change it. Several `read` grants coexist.
- **`write`** — I may change it. A `write` grant is exclusive and it excludes concurrent `read`s on
  the same entity id.
- **`enumerate`** — I will LIST a shared-account collection whose contents include my siblings'
  entities. Nothing is mutated, and yet it is not a `read`: a listing on a shared account is not a
  stable observation and can never be an assertion target.

### Why `enumerate` exists

Measured on a real fleet: three workers minted three distinct API tokens under three isolated profiles,
and one of them found that the account's own token-listing endpoint returns ALL of them. The
isolation was real at the file level and absent at the API level. Nothing collided, nothing was
mutated, and an assertion on "the account has N tokens" would have been wrong for all three of them
at once. The same shape appears in a delivery fleet whenever a worker's validation lists a shared
collection: the rows of a table every sibling seeds, the users of a shared auth project, the env
vars of one deploy project.

So the rule: a collection endpoint on a shared account is claimed as `enumerate`, and an
`enumerate` claim carries one consequence the conductor must broadcast — **nobody asserts on the
collection's size, contents or ordering.** Assert on your OWN entity, found by its own id. Several
`enumerate` grants coexist (like `read`); a `write` on the same entity id still excludes them.

State the claim at the smallest id you can defend. `seed:checkout-cart` is arbitrable;
`seed:all` is a fleet-wide stop.

---

## 2 · Message shapes

The runtime has no `claim` message type. The protocol lives in the SUBJECT, so it is greppable in the
mailbox and in the ledger, and the body carries the reason a human would need to arbitrate.

Worker → conductor (declare):

```bash
orca orchestration send --type status \
  --subject "CLAIM seed:checkout-cart write" \
  --body "BK-123 Stage 2: I mutate the cart totals to validate the discount rule in the live UI. ~15 min. Alternative if denied: seed my own cart." \
  --json </dev/null
```

Conductor → worker (grant or deny):

```bash
orca orchestration send --to dispatch:<id> --type status \
  --subject "CLAIM-GRANTED seed:checkout-cart write" --body "Yours until you release it. W3 is queued behind you." --json </dev/null

orca orchestration send --to dispatch:<id> --type status \
  --subject "CLAIM-DENIED seed:checkout-cart write" --body "W2 holds the write. Use <alternative>: seed your own cart under your own prefix." --json </dev/null
```

A worker whose claim was pre-granted in its brief (§3 rule 0) sends the same shape ONCE as an
announcement and does not wait:

```bash
orca orchestration send --type status \
  --subject "CLAIM record:orders@staging enumerate" \
  --body "Pre-granted in my brief. The orders list on staging shows every sibling's seeded orders, so I validate only my own order id, never the collection." \
  --json </dev/null
```

Worker → conductor (release, only when the release is EARLY):

```bash
orca orchestration send --type status --subject "CLAIM-RELEASED seed:checkout-cart write" --body "done with it" --json </dev/null
```

A denial that names no alternative is a bug in the protocol: the conductor either grants, or denies
AND says what to do instead. A worker that receives a bare denial asks once with a blocking `ask`.

---

## 3 · Arbitration rules

0. **A claim listed in a worker's brief is PRE-DECLARED and PRE-GRANTED.** The conductor decided it
   at triage (§5) and granted it at launch, so the worker announces it and starts working. Only a
   claim DISCOVERED mid-run waits for a grant.
   This rule exists because the contradiction it resolves cost a real stall: the protocol said "wait
   for the grant" while the brief said the list was pre-agreed, and a worker correctly stopped,
   unable to tell which document governed. If a claim needs arbitration, it does not belong in the
   brief; if it is in the brief, it does not need arbitration.

1. **First message wins.** Order is the mailbox's arrival order, not the worker's clock and not the
   roster order. This is the whole rule; it needs no tie-breaker in normal operation.
2. **`write` is exclusive**; `read` and `enumerate` grants stack. A `write` request against a live
   `read` or `enumerate` grant queues behind it, and the conductor tells the requester who is ahead.
   An `enumerate` grant is broadcast with its consequence attached: nobody asserts on that
   collection's size, contents or ordering.
3. **Rare genuine dispute** (two claims in the same batch, same entity, same intent): the conductor
   decides, on impact — whoever is further along, or whoever is blocked hard rather than
   inconvenienced. It writes the reason in the ledger. There is no automatic resolution to appeal to.
4. **A grant is released by `worker_done`.** Every claim a worker held is released the moment its
   `worker_done` lands, with no separate message. An explicit `CLAIM-RELEASED` is only for releasing
   early so a queued worker can move.
5. **The conductor broadcasts the consequence** to the workers it affects: the one who gets the grant,
   and the ones who were waiting. A grant nobody is told about is a lock with no lock.
6. **The conductor never holds a claim for itself while also arbitrating one.** Conductor-only
   operations (applying a migration, regenerating types or schemas, merging and deploying, fleet-altitude
   tracker writes) happen with no worker in flight against them, or after the affected workers were
   told to wait. See `references/coordinator-playbook.md` §7.

---

## 4 · The ledger

`.session/orchestration/<slug>/claims.md`, owned by the conductor, append-only, one line per event:

```
[HH:MM] <worker> <entity>:<id> <read|write|enumerate> <pre-granted|granted|denied|released>
```

Example:

```
[09:30] W1 record:orders@staging enumerate pre-granted   -> no assertion on the collection
[09:41] W2 seed:checkout-cart write granted
[09:44] W3 seed:checkout-cart write denied      -> seeds own cart
[10:02] W2 seed:checkout-cart write released
[10:02] W3 seed:checkout-cart write granted
```

A `pre-granted` line is written by the conductor at LAUNCH, from the brief, not when the worker
announces it. Then the ledger and the briefs cannot disagree about what was already decided.

Append-only because two writers rewriting one file is the failure the ledger exists to prevent. The
ledger is the answer to "why did BK-140 use different data than BK-123" three days later.

---

## 5 · Collision detection at triage (planning aid)

Runtime claims are the safety net. The cheap win is not needing them, and that is a triage-time
decision made in the SAME vocabulary, before anything launches:

1. For each unit of work, write down the entities it will touch and the intent
   (`identity:default@staging write`, `seed:catalog read`, `record:orders@staging enumerate`).
2. Two units with the same `entity:id` and at least one `write` → **do not put them in the same
   round**, or re-scope one to seed its own data.
3. Two units with the same entity and both `read`, or both `enumerate` → same round is fine. For
   `enumerate`, carry the consequence into both briefs: no assertion on the collection.
4. Write the resulting per-unit claim list into each worker's brief, and log each one as
   `pre-granted` in the ledger at launch (§3 rule 0, §4). A claim in the brief is a decision already
   taken; the worker announces it and works.

This is where the pairing is decided, and it is much cheaper than arbitrating the same collision at
10:41 with two workers stalled.

---

## 6 · Fallback with no runtime (degraded, optional)

With no mailbox there is no arbiter, so the protocol degrades to a convention over the same file:

- `claims.md` lives in the scope the workflow skill already writes to and is **append-only**.
- Before touching a shared entity, a session greps `claims.md` for that `entity:id`. A live `write`
  line with no matching `released` line means: do not touch it, seed your own data.
- Claiming = appending one line with the same four fields, then re-grepping to confirm nobody
  appended the same claim in between.
- Releasing = appending a `released` line.

Be honest about what this is: a cooperative convention with a real race window between the grep and
the append, and no recovery when a session dies holding a claim. It is strictly better than nothing
and strictly worse than an arbiter. Document in the run notes that the fleet ran degraded, and keep
rounds smaller.
