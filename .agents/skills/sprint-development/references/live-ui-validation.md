# Live-UI validation: mechanics (flow-aware, `/playwright-cli` sessions)

> Owned by `/sprint-development`. `SKILL.md` holds the WHEN and WHAT (the five principles and the hard rules in the **Live-UI validation** subsection), and this file holds the HOW. Live-UI validation runs against the running app, never against a static read of the mockup plus green lint, types and tests. Those stay green while the rendered UI is wrong.

---

## 0. Identity contract (read before any login)

`references/live-ui-identity.md` governs which account the automation logs in as and which shortcuts are forbidden while doing it. Read it before the first authenticated action of a run. What binds here:

- The identity is declared by variable name in `testing.automation_identity` in `.agents/project.yaml` (with optional `per_env` overrides) and resolved from `.env` at runtime. The names below are examples, not required spellings.
- It is a dedicated non-production account, or an intentionally public shared demo account. It is never a real user, an admin or staff account, or anything with production reach.
- The gate is fail-closed. When the slot is unset, the variable is missing from `.env` or `scope` is unset, stop and report. Do not pick a different account, query the database for one, create one or reuse the human's open browser session.
- The app's own login path is the only way in. That rules out service-role, secret and admin keys, admin user-management APIs, generated magic or reset links, locally signed JWTs, hand-written session cookies and impersonation. The full statement and rationale are in `live-ui-identity.md` §3.
- Session material (cookie jar, `storageState.json`, `.har`, token files) follows the ephemeral-artifact contract: scratch directory only, deleted before reporting, disclosed through `secrets_materialized:` and `cleaned:`.

When live-UI work goes to a subagent, these rules travel in briefing component 7 or they do not exist for the executor (`live-ui-identity.md` §5).

---

## 1. Tool resolution

`[AUTOMATION_TOOL]` resolves to `/playwright-cli` (`.agents/instructions/agent-tool-resolution.md` §6 Tool Resolution). It is the only browser path. It spawns its own browser per named session, logs in with the declared automation identity, is not bound to the Claude session, and runs the same inside a stage subagent, in Solo mode and on any of the three hosts. The boilerplate ships no browser MCP, so there is nothing to rank it against.

| Tier | Tool | Use | Session-bound? |
| ---- | ---- | --- | -------------- |
| 0 (COMPLEMENT) | Authenticated HTTP probe (`[API_TOOL]`) | No browser. Fast inner loop and server-rendered assertions only. It cannot replace the browser tier (§7 has the capability boundary). | No |
| 1 (BROWSER) | Playwright CLI (`/playwright-cli`) | Every rendered, interactive or visual check, and every screenshot cited as evidence. | No |

Load the owning skill before invoking the binary (`.agents/instructions/agent-tool-resolution.md` §6.5): `playwright-cli` maps to `/playwright-cli`. That skill owns the HOW of each verb (flags, syntax). §3 owns which session, which identity and how sessions stay apart, because the vendor skill cannot carry this repo's rules.

---

## 2. Flow-aware execution

Validation runs wherever the active flow mode runs. The mode is resolved once at Phase 0 and locked for the run (`SKILL.md`, "Execution mode").

- **Orchestrated (default):** live-UI validation happens inside the stage subagent that owns it. The Stage 2 implementer does the real-time check, and the Stage 3 verifier does the final pass.
- **Solo (opt-in):** live-UI validation happens inline in the one session, with the same stage boundaries.

The flow mode decides where it runs, not the tool. `/playwright-cli` has no session binding, so there is no exception to place.

---

## 3. Browser sessions

The measurements behind the rules below (what the shipped config isolates, what prints a secret, what a kill reaches) are in `.context/ADR/ADR-0003-forensic-measurements-ledger.md`.

### 3.1 The question before the first `open`

Before the first `open`, answer one question: does the page need a logged-in session? The answer picks exactly one case.

| Case | When | How it starts | How it ends |
|---|---|---|---|
| (a) anonymous | public pages, the login page itself, anonymous-redirect checks, anything with no login | `-s=<name> open <url>` | `close` |
| (b) automation identity | any screen behind the app's login, as the identity declared in `testing.automation_identity` (§0) | `-s=<name> open`, then log in through the app's own login form (§3.3) | `close` |

There is no third case. The human's own browser, a persistent profile with someone's real accounts in it, and a session borrowed from an already-open tab all sit outside the identity contract (`live-ui-identity.md` §1-§3). This repo therefore never attaches to the human's Chrome and never opens a `--profile`.

The shipped `.playwright/cli.config.json` launches every session in memory and headless: no profile on disk, nothing shared between two session names. `--headed` is explicit, and only for when a human must watch the window (a demo, a pairing call). `bun sync` delivers that file once when it is missing and never overwrites it, so a project keeps the copy it tuned. If a project's copy grows a `userDataDir` or `"isolated": false`, every session name shares one profile and nothing in §3.4 holds. Remove both keys, with the human's OK, before trusting a session name as isolation.

### 3.2 Rules for every session

1. Use a named session (`-s=<name>`), never the default one. A story session is named after the ticket (`-s=<KEY>`), a fleet worker's after its label, and a second identity gets a suffix (`-s=<KEY>-admin`).
2. Never `--persistent` and never `--profile`. Both put a browser profile, which is session material, on disk outside the session scratch directory. In-memory is the only mode this repo uses.
3. One identity is one live browser. Never run two sessions, two subagents or two worktrees logged in as the same account at once: an app with single-session auth silently drops the older one, and the failure reads as a product bug. Subagents that need the same identity run serially, and parallel work needs a second declared identity.
4. Work from `snapshot` refs, not CSS selectors or coordinates.
5. `close` is mandatory, even after an error, and `playwright-cli list` is the proof (Critical Rule #16): your session names are absent from the list, which a `close` receipt alone does not show. Every session closes before its report.
6. Never `pkill` a browser or the daemon, and never `close-all` or `kill-all` while any other session may be working. They end every session in the workspace or on the machine, other worktrees included, and flush nothing. Close your own sessions by name.
7. Release a stuck `beforeunload` ("does not handle the modal state") with `dialog-accept`. An unexpected confirmation dialog on a write gets `dialog-dismiss`, and you stop.
8. Values print by default. Use `--raw` when a command's output is a value you only compare, and `run-code --filename <file>` for non-trivial code (shell escaping silently breaks large inline snippets).
9. Evidence goes to an explicit path: `screenshot --filename <story evidence dir>/<screen>-<state>.png`. The default name lands in `.playwright/output/` (gitignored), which every session of the worktree shares.

### 3.3 Logging in as the automation identity (case b)

The variable names come from `testing.automation_identity` in `.agents/project.yaml` (plus `per_env.<active_env>`). `QA_E2E_USER_*` below are the boilerplate's default names, so substitute the project's. Values come from `.env` (Critical Rule #1).

```bash
# Fail-closed (live-ui-identity.md §2): either name unset or empty → STOP and report, never improvise an account.
bunx varlock run -- sh -c '[ -n "${QA_E2E_USER_EMAIL:-}" ] && [ -n "${QA_E2E_USER_PASSWORD:-}" ]' || { echo "automation identity missing: see testing.automation_identity"; exit 1; }

playwright-cli -s=<KEY> open <web url>/login
playwright-cli -s=<KEY> snapshot                                  # find the field refs
bunx varlock run -- sh -c 'playwright-cli -s=<KEY> --raw fill <email-ref> "$QA_E2E_USER_EMAIL"'
bunx varlock run -- sh -c 'playwright-cli -s=<KEY> --raw fill <password-ref> "$QA_E2E_USER_PASSWORD"'
playwright-cli -s=<KEY> click <submit-ref>
playwright-cli -s=<KEY> --raw eval "location.href"                # landed past the login page?
playwright-cli -s=<KEY> goto <web url>/<story-screen-route>
playwright-cli -s=<KEY> screenshot --full-page --filename <story evidence dir>/<screen>-default.png
# repeat for loading / empty / error states + responsive breakpoints (§4; `resize <w> <h>`)
playwright-cli -s=<KEY> close
playwright-cli list                                               # <KEY> is gone
```

- `--raw fill <ref> "$VAR"` is the only way a credential is typed. `fill` echoes what it typed in its "Ran Playwright code" block. With `--raw`, the shell expands the variable, the command text carries only its name, and the echo is suppressed.
- The variables are never in the agent's own process: the harness is opened bare and holds no `.env` value (ADR-0016). Every command that needs one runs through the loader in a subprocess, `bunx varlock run -- sh -c '...'`, and the single quotes keep `$VAR` unexpanded until varlock has loaded `.env`.
- After the login, verify which account is signed in (a profile menu, `/me`, the user's email on screen) before trusting any result. A login page after `goto` means the session expired. Log in again through the same form, never through a shortcut from `live-ui-identity.md` §3.
- `{{WEB_URL}}` of the active env comes from `.agents/project.yaml`. The real-time check (§5.1) uses the local dev server: `{{stack.package_manager}} run {{stack.scripts.dev}}` from `{{stack.app_root}}`, with the name confirmed in the app's `package.json` (AGENTS.md Rule #10).

### 3.4 Session material is a secret

A storage-state file, a cookie value and a request's `Authorization` header are the login in another shape (`live-ui-identity.md` §4).

- Do not print them. `cookie-list`, `cookie-get`, `localstorage-list`, `sessionstorage-list`, `request-headers` and `request <n>` on a logged-in session print the values, so none of them runs there. Read a single non-session key a check needs with `--raw ... -get <key>`, never as a dump of the store.
- In-memory needs no cleanup, which is why it is the default. A `state-save` is only for reusing one login across sessions of the same run, and then it has a full path inside the session scratch directory (never the repo, never `.auth/`; with no filename it writes `storage-state-<timestamp>.json` into the current directory), `chmod 600` right after, deletion before the report, and the disclosure `secrets_materialized: storage-state` plus `cleaned: yes`.
- Never photograph a filled password field. Capture evidence on screens that do not show the credential.

### 3.5 Fleets and parallel sessions

- The session namespace is the nearest ancestor directory with a `.playwright/` folder. Each worktree is its own namespace, so the same `-s` name in two worktrees is two different browsers, and `playwright-cli list --all` shows every workspace on the machine. A directory with no `.playwright/` above it falls into one machine-wide default namespace, so run `playwright-cli` from inside the worktree.
- Under the shipped config two session names never share a profile, so the name is the isolation: one name per worker, and nothing on disk to clean.
- Rule §3.2.3 binds across the fleet. The orchestrator serializes workers that need the same identity, or declares a second identity for the parallel one.

---

## 4. Per-screen validation checklist

For every screen the story touches, validate the rendered result, not the source:

- [ ] **Layout and structure:** matches the screen's intent; no truncation, overflow or clipped controls (for example a dropdown that cuts off its options).
- [ ] **Design tokens:** colors, spacing and typography come from `DESIGN.md` (and the frozen-token contract or `master-design-plan.md` §2 when present). No hardcoded hex or off-system spacing.
- [ ] **Live-UI consistency:** consistent with the current live components and navigation, per the LIVE-UI-FIRST doctrine (AGENTS.md Critical Rule #14). Reuse existing components, and do not blind-copy a mockup that conflicts with the improved live UI.
- [ ] **Loading state:** skeleton or spinner renders, no layout shift.
- [ ] **Empty state:** message and CTA present.
- [ ] **Error state:** message and retry path present.
- [ ] **Responsive:** mobile, tablet and desktop breakpoints hold.
- [ ] **AC interactive flows:** every interactive Acceptance Criterion is exercised end to end in the running app (click, type, submit, navigate) and observed to work.
- [ ] **Navigation:** how the user reaches and moves through this screen is correct (LIVE-UI-FIRST principle 3: navigation is paramount for UX).

---

## 5. Two patterns and the fix loop

### 5.1 Real-time during implementation (Stage 2)

While building UI, keep the dev server up and re-render after each meaningful change. That catches render bugs as you code instead of after, since tests and types stay green while the pixels are wrong. It often collapses scope: when the live UI already has the affordance the story assumed was greenfield, the task becomes harden, not build (LIVE-UI-FIRST: inspect and reuse first).

### 5.2 Final verification pass (Stage 3)

Before approving the PR, run a clean pass over all of the story's screens against the §4 checklist (all states, responsive, every interactive AC). Capture evidence into `.session/sprint-development/<KEY>/evidence/` for the Spec Compliance Matrix, and publish what a matrix row cites on the PR or the Jira issue (the session folder is working scratch).

### 5.3 Fix loop (gate)

A UI story cannot reach merge with an open, unratified live-UI gap. On any gap:

1. Fix it immediately. In Orchestrated mode, dispatch a fix subagent (`fix-issues.md`); in Solo mode, fix inline.
2. Re-validate the affected screen or screens.
3. Repeat until clean. For a deliberate, user-approved departure, ratify it as a `master-design-plan.md` §5 divergence (plus an ADR if architectural) before approving.

Non-UI stories skip live-UI validation entirely.

### 5.4 Post-write pass (after the UI is built)

The design set loads before the first write (`agentic-dev-core/references/skill-composition-strategy.md` §3.5); this pass runs after it, on the built screen, in the Stage 2 implementer and again in the Stage 3 verifier.

1. `/impeccable` critiques the live screen (hierarchy, states, responsive behaviour, copy) from the §4 screenshots.
2. `npx modern-web-guidance@latest legacy-scan <the changed UI files>` (paths under `src/features/<x>/` and the shared components touched) lists legacy patterns the platform now covers.
3. Record each finding like any other validation finding and loop through §5.3: fix, or ratify a deliberate keep with its reason. Save the critique notes and the scan output in `.session/sprint-development/<KEY>/evidence/` so the PR can cite them.

**Hard rules (carried from `SKILL.md`).** Validate against the running dev server (`{{stack.scripts.dev}}`, confirmed in the app's `package.json`), never against a production build. Log in as the declared automation identity, resolved by variable name from `.env`, never hardcoded and never bypassing the app's login path (§0 and `live-ui-identity.md`), in a named in-memory `/playwright-cli` session (§3). Before reporting, close every session, delete any session material written to disk and disclose `browser_sessions:`, `secrets_materialized:` and `cleaned:` (§6).

---

## 6. Session checklist before reporting

Every live-UI report (stage subagent or inline Solo stage) carries:

- `browser_sessions:` the `-s` names it opened, and `playwright-cli list` showing none of them open.
- `secrets_materialized:` `none` (in-memory sessions only) or the kinds written (`storage-state`), with `cleaned: yes|no (<reason>)`. `cleaned: no` is a blocker surfaced to the user (AGENTS.md §3, ephemeral-artifact contract).
- The tier that produced each piece of evidence (§7, Reporting).

---

## 7. Tier 0: authenticated HTTP probe (sanctioned light path)

Spinning up a full browser for every check is expensive, and a large share of what a server-rendered app does is observable over plain HTTP. A scripted authenticated fetch is a sanctioned complement to the browser tiers and never a replacement.

**Shape** (tool-agnostic, `[API_TOOL]`): log in through the app's own login endpoint using the declared automation identity, keep the session (cookie jar or auth header) in the session scratch directory, fetch the routes under test, assert on status, redirects and the server-rendered markup, and delete the session file before reporting.

The identity contract (§0), the prohibition list and the ephemeral-artifact contract apply in full. A probe is a login like any other: the same shortcuts stay forbidden, and a cookie file is exactly the material §0 requires you to clean up.

### Sanctioned for

- Route reachability and HTTP status (200, 404, 500 on the story's routes).
- Auth behaviour: a protected route redirects when anonymous and is reachable when authenticated, with the correct post-login destination.
- Presence or absence of server-rendered content: a heading, a row, a data-testid, an empty-state string that the server emits.
- Data correctness in the delivered markup (right records, right ordering, right formatting).
- Fast regression re-checks on a route already validated visually, after an unrelated change.
- Non-UI stories that expose an endpoint or an SSR page and never needed the browser tiers.

### Not sufficient for (browser tier required)

Every item below is in the §4 checklist and cannot be observed over HTTP:

- Layout, spacing, overflow, truncation, clipped controls.
- Design-token conformance as computed styles.
- Loading, empty and error states produced by client-side JavaScript after hydration.
- Responsive breakpoints.
- Interactive AC flows (click, type, submit, navigate) and post-hydration behaviour.
- Screenshot evidence for the Spec Compliance Matrix.

**Rule.** Tier 0 may carry the Stage 2 inner loop and non-visual assertions. The Stage 3 final verification pass on a UI story is always browser-based (§5.2). A UI story approved on HTTP evidence alone violates S14.

**Reporting.** Say which tier produced each piece of evidence. `manual:<path>` rows in the Spec Compliance Matrix that came from a probe are labelled as such, so a reader does not read "verified" as "rendered".
