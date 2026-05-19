# Verification Checklist

> **Purpose**: Hard gate before declaring the run done. Mirrors §8 + §11 of the source prompt. Eight checks. Fix-and-rerun on any failure.
>
> **When to read**: Phase 8 of `SKILL.md`. Re-run after EVERY surgical patch, not just fresh scaffolds.

---

## Order matters

1. Type check
2. Build
3. Lint
4. Browser smoke (via `/playwright-cli`)
5. Artifact destination renders correctly
6. Repo diff is free of secrets
7. Snapshot comment is correct
8. Self-check (§11 mirror)

---

## 1. Type check

```bash
# Read the actual command from package.json — do NOT trust this example
bun run typecheck
```

Expected: exit 0, no new errors. Pre-existing errors that the run didn't touch are OK but flag them.

If the host uses a different script name (`bun run lint:types`, `tsc --noEmit`, `npm run typecheck`, etc.) → READ `package.json` and pick the right one (CLAUDE.md Critical Rule #12).

## 2. Build

```bash
bun run build
```

Expected: exit 0. Build artifacts produced. No new warnings from the `/qa` page or its imports.

If `build` is gated behind environment variables not set in the dev shell → fall back to `bun run dev` + `curl /qa` for an HTTP 200 check.

## 3. Lint

```bash
bun run lint:check
```

Expected: clean, OR only pre-existing warnings on files this run did not touch.

If the host uses ESLint flat config + custom rules that fail on the generated page → DO NOT disable the rules. Fix the page to comply.

## 4. Browser smoke (Playwright CLI)

Load `/playwright-cli`. Run:

- Open `/qa` against the local dev server (`{{environments.local.WEB_URL}}/qa`, fallback `http://localhost:3000/qa`).
- Assert the page returns 200, the H1 reads `Software Testability Guide for QA`, and `data-testid="qa-page"` is present.
- Click `data-testid="qa-credentials-button"` → assert it opens the credentials destination URL in a new tab.
- Expand every accordion / section → assert `data-testid` selectors render their code blocks.
- If the redirect was added (Q4 = yes) → request the old route → assert a 301 / 308 to `/qa`.
- Take ONE full-page screenshot for the PR body.

If `/playwright-cli` is not available in the host → degrade to a curl smoke (HTTP 200 + body contains the H1 string) and warn the user that visual checks were skipped.

## 5. Artifact destination renders correctly

For the chosen publisher in Q1:

- Open the destination URL in a browser tab (the user does this, the skill cannot).
- Confirm snippets render with native copy buttons.
- Confirm the access gating is in place (the page / Epic is restricted to the right group / people).
- Confirm the footer link back to `/qa` is clickable.

Mark this check as `user-confirmed: true` or `user-confirmed: pending` in the audit trail.

## 6. `git diff` is free of secrets

```bash
git diff --staged
git diff
```

Manually scan for:

- Password-shaped strings (12+ chars, mixed case + digits).
- Token-shaped strings (`eyJ…`, `sk_…`, `pk_live_…`, `xoxb-…`).
- Private hostnames (e.g. `<random>.upexgalaxy.com`).

If anything matches → STOP. Remove from the diff. Re-run from step 1.

## 7. Snapshot comment is correct

Open the generated page file. Verify the snapshot comment at the top:

- Contains every field from `idempotency-snapshot.md`.
- `content-hash` matches the rendered credentials-content body.
- `generated` is today's date.
- `publisher` matches Q1.
- `credentials-source` is the actual destination URL.

If a field is missing or stale → patch + re-run step 1.

Special case — `content-hash=sha256:pending-post-publish`: this is the Pass 1 placeholder from the two-pass write described in `idempotency-snapshot.md`. It is NOT a failure of step 7. The placeholder means Phase 6 (publish) has not yet computed the real hash. The orchestrator MUST run Pass 2 (compute hash + patch the page file in place) BEFORE step 8. If the placeholder is still present when step 8 runs → the publish step was skipped or aborted; surface the issue, do not declare the run complete.

## 8. Self-check (§11 mirror)

Answer each out loud in the final report:

- [ ] Did the skill read the codebase before writing? (Stack, UI kit, icons, auth, language, existing pages.)
- [ ] Did it batch the Q1–Q5 decisions into one message and wait for answers?
- [ ] Did the user choose where credentials live, and is the credentials-source artifact created or updated at that location?
- [ ] Does the `/qa` page render in the host UI kit, with copy-buttoned snippets and the required `data-testid`s?
- [ ] Is the credentials CTA the first thing a tester sees above the fold?
- [ ] Are there zero real secrets in the repo, zero AI-attribution lines in commits, and zero pushes to the default branch?
- [ ] Does the host's build script pass after the changes?
- [ ] Is the PR opened against the right base branch (the detected default branch, NOT assumed `main`)?

If any item is "no" → finish it before reporting completion.

---

## Failure escalation

If a check fails twice in a row after attempted fixes → STOP. Report the failure to the user with full context (command, exit code, last 20 lines of output). Do not paper over by skipping the check or by re-trying indefinitely.
