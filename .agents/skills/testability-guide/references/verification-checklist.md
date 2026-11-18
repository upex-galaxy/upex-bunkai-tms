# Verification checklist

> **Purpose**: the hard gate before the run is declared done. Eight checks. On any failure, fix and re-run from step 1.
>
> **When to read**: Phase 8 of `SKILL.md`. Re-run it after every surgical patch, not only after a fresh scaffold.

---

The checks run in the order of their numbers.

---

## 1. Type check

```bash
# Read the actual command from package.json, do not trust this example
bun run types:check
```

Expect exit 0 and no new errors. Errors that were already there and that the run did not touch are acceptable, but flag them.

When the host uses a different script name (`bun run lint:types`, `tsc --noEmit`, `npm run typecheck`), read `package.json` and pick the right one (AGENTS.md Critical Rule #10).

## 2. Build

```bash
bun run build
```

Expect exit 0 and no new warnings from the `/qa` page or its imports.

When `build` needs environment variables the dev shell does not set, fall back to `bun run dev` plus `curl /qa` for an HTTP 200 check.

## 3. Lint

```bash
bun run lint:check
```

Expect a clean run, or only warnings that were already there on files this run did not touch.

When a custom ESLint rule fails on the generated page, fix the page and leave the rule enabled.

> **MCP-config JSONC is lint-sensitive.** If this run edited `.mcp.json` or `opencode.jsonc` to wire testing MCPs, the host lint may enforce one array item per line (for example `antfu/consistent-list-newline`) on JSON and JSONC arrays, and an inline `["a", "b"]` fails. Run the host's `lint:fix` on the edited config files and the generated page before this check. Otherwise a pre-push `repo:check` hook rejects the push.

## 4. Browser smoke (Playwright CLI)

Load `/playwright-cli` and run:

- Open `/qa` on the local dev server (`{{environments.local.web_url}}/qa`, falling back to `http://localhost:3000/qa`).
- Assert the page returns 200, the H1 reads `Software Testability Guide for QA`, and `data-testid="qa-page"` is present.
- Assert `data-testid="qa-build-sha"` is present. Locally the platform SHA variable is unset, so the stamp shows the fallback line and `data-sha` is empty. That is the expected local result, not a failure.
- Click `data-testid="qa-credentials-button"` and assert it opens the credentials destination URL in a new tab.
- Expand every accordion and section and assert the `data-testid` selectors render their code blocks.
- If the redirect was added (Q4 = yes), request the old route and assert a 301 or 308 to `/qa`.
- Take one full-page screenshot for the PR body.
- **Deployed build stamp**, once the change reaches a deployed environment (staging after `/sprint-development` Stage 4, for example): open that environment's `/qa`, read `data-sha` from `qa-build-sha`, and confirm two things. It is the commit that environment should run (`git rev-parse origin/<deployed branch>`), and a deployment exists for it (load `/vercel-cli`: `vercel ls -m githubCommitSha=<sha> --format json`). An empty `data-sha` on a deployed environment means the SHA source is missing there (on Vercel, the system-env exposure setting is off). Fix the source and never hardcode the value.

When `/playwright-cli` is not available in the host, degrade to a curl smoke (HTTP 200 and a body that contains the H1 string) and warn the user that the visual checks were skipped.

## 5. Artifact destination renders correctly

For the publisher chosen in Q1, confirm:

- The destination URL opens in a browser tab (a person does this).
- Snippets render with native copy buttons.
- Access gating is in place (the page or Epic is restricted to the right group or people).
- The footer link back to `/qa` is clickable.

Mark the check `user-confirmed: true` or `user-confirmed: pending` in the audit trail. A run with nobody at the keyboard records `pending` and reports it.

## 6. `git diff` is free of secrets

```bash
git diff --staged
git diff
```

Scan for:

- Password-shaped strings (12 or more characters, mixed case and digits).
- Token-shaped strings (`eyJ…`, `sk_…`, `pk_live_…`, `xoxb-…`).
- Private hostnames (for example `<random>.upexgalaxy.com`).
- A literal commit SHA (7 to 40 hex characters) in `app/qa/**`. The build stamp is runtime-only, so a literal means codegen baked the value in.

On any match, stop, remove it from the diff and re-run from step 1.

## 7. Snapshot comment is correct

Open the generated page file and check the snapshot comment at the top:

- It contains every field from `idempotency-snapshot.md`.
- `content-hash` matches the rendered credentials-content body.
- `generated` is the date of the run.
- `publisher` matches Q1.
- `credentials-source` is the actual destination URL.

A missing or stale field gets patched, then the run restarts at step 1.

Special case: `content-hash=sha256:pending-post-publish` is the Pass 1 placeholder of the two-pass write in `idempotency-snapshot.md`, and it does not fail step 7. It means Phase 6 (publish) has not yet computed the real hash. The orchestrator runs Pass 2 (compute the hash and patch the page file in place) before step 8. If the placeholder is still there when step 8 runs, the publish step was skipped or aborted: surface that and do not declare the run complete.

## 8. Self-check

Answer each item in the final report:

- [ ] Did the skill read the codebase before writing (stack, UI kit, icons, auth, language, existing pages)?
- [ ] Did it batch Q1 to Q5 into one message and wait for the answers (or, with nobody at the keyboard, use the routine path in `decision-questions.md`)?
- [ ] Did the user choose where credentials live, and is the credentials-source artifact created or updated there?
- [ ] Does the `/qa` page render in the host UI kit, with copy-buttoned snippets and the required `data-testid`s?
- [ ] Is the credentials CTA the first thing a tester sees above the fold?
- [ ] Are there zero real secrets in the repo, zero AI-attribution lines in commits and zero pushes to the default branch?
- [ ] Does the host's build script pass after the changes?
- [ ] Is the PR opened against the right base branch (the detected default branch, not an assumed `main`)?

Any "no" gets finished before completion is reported.

---

## When a check keeps failing

When a check fails twice in a row after attempted fixes, stop and report the failure with full context (command, exit code, last 20 lines of output).
