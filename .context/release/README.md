# Release ledgers

One file per release: `pending-production-v<N>.md`. It records everything that happened on
`staging` and does **not** travel in a git commit, but must still be true in production.

## Why this exists

Git can already tell you what code changed — the changelog is derivable from the commit
log. What git cannot know is that a rate limit was raised in a dashboard, that a schema was
applied out of band, or that two changes must land in the same breath or sign-in breaks.

Those are the ones that get forgotten, and they get forgotten precisely because there is no
diff to notice them in. Three real examples are already in
[`pending-production-v2.md`](./pending-production-v2.md), all discovered in a single
afternoon of testing the login module.

## The rule

> **If you did something outside git, write the entry before you close the ticket.**

Not at release time — by then the person who knew has moved on, and "what did we change in
Supabase?" is not a question anyone can answer from memory. The entry is written at the
moment of discovery, by whoever discovered it.

What belongs here:

- dashboard / console configuration (Supabase auth, SMTP, rate limits, redirect allow-lists)
- migrations applied out of band, or applied in an order that matters
- environment variables added to Vercel or any other host
- third-party settings (OAuth apps, DNS, webhooks)
- release mechanics that are easy to skip (version bumps, tags, cache invalidation)
- **atomic pairs** — two changes that break something if applied separately. Say so loudly.

What does not: ordinary code changes (git has them), architectural decisions
(`.context/ADR/`), per-ticket status (`.context/reports/`), or bugs (the tracker).

## The gate

```bash
bun run release:check           # newest ledger
bun run release:check -- --all  # every ledger
bun run release:check -- --json
```

Exits non-zero while anything is outstanding. Run it before promoting `staging` → `main`.

This is the part that keeps the file honest. A written checklist decays the moment someone
completes an item and forgets to tick it — or ticks it without doing it. Here **the
checkbox is the command**, so the state is re-derived from reality on every run rather than
trusted from the page.

## Entry format

The parser in [`scripts/check-release-readiness.ts`](../../scripts/check-release-readiness.ts)
reads entries under `## Pending` only:

````markdown
### <KEY> · <Short title>

- **Type:** supabase-config | migration | env-var | release-mechanics | risk
- **Atomic:** yes/no — and if yes, with what
- **Applies to:** which environments
- **Ticket:** BK-NNN · **PR:** #NNN

Prose: what was done, why, and what breaks if it is missed. Be specific — the reader is
someone doing the release months from now with no memory of this week.

```bash verify
# Exits 0 when the action is genuinely done. Prefer querying the live system over
# asserting a local file, since the whole point is to check reality.
```
````

An entry **without** a `verify` block is reported as `MANUAL` and still blocks the gate, so
an unverifiable action cannot be quietly skipped. Write one wherever you can.

Verify commands run through `bash` with the session environment, so `.env` values such as
`SUPABASE_ACCESS_TOKEN` are available. Never inline a secret into the command itself — read
it from the variable, per Critical Rule #1.

## Lifecycle

1. **During the sprint** — entries are appended to the current ledger as they are discovered.
2. **At release** — `bun run release:check` must exit 0. Anything outstanding is either done
   or consciously deferred (move it to the next ledger with a note, do not delete it).
3. **After release** — verified entries move to `## Done` with the date, the file is left in
   place as the record of that release, and `pending-production-v<N+1>.md` starts empty.

Ledgers are never deleted. They are the only history of what was changed outside the repo.

## Related

- `.context/ADR/` — architectural decisions (why), not release actions (what to do)
- `.context/reports/` — per-sprint ticket status
- `docs/workflows/git-flow.md` — the branch model; release promotion is fast-forward only
