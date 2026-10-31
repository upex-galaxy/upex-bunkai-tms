# Live-UI validation — mechanics (flow-aware, `/playwright-cli` sessions)

> Owned by `/sprint-development`. SKILL.md holds the WHEN/WHAT (the five principles + hard rules in the **Live-UI validation** subsection); this file holds the HOW. Live-UI validation runs against the **running app**, never a static read of the mockup plus green lint/types/tests — those stay green while the rendered UI is wrong.

---

## 0. Identity contract (read BEFORE any login)

Which account the automation logs in as, and which shortcuts are forbidden while doing it, are governed by **`references/live-ui-identity.md`**. Read it before the first authenticated action of a run. Summary of what binds here:

- The identity is declared BY VARIABLE NAME in `.agents/project.yaml` → `testing.automation_identity` (with optional `per_env` overrides) and resolved from `.env` at runtime. The names below are examples, not required spellings.
- It must be a **dedicated non-production account** (or an intentionally-public shared demo account). Never a real user, an admin/staff account, or anything with production reach.
- **Fail-closed**: slot unset, variable missing from `.env`, or `scope` unset → **STOP and report**. Do not pick a different account, do not query the database for one, do not create one, do not reuse the human's open browser session.
- **Never bypass the app's own login path.** No service-role / secret / admin keys, no admin user-management APIs, no generated magic or reset links, no locally-signed JWTs, no hand-written session cookies, no impersonation. Full statement + rationale: `live-ui-identity.md` §3.
- Session material (cookie jar, `storageState.json`, `.har`, token files) follows the ephemeral-artifact contract: scratch dir only, deleted before reporting, disclosed via `secrets_materialized:` / `cleaned:`.

When live-UI work is dispatched to a subagent, these rules travel in briefing component 7 or they do not exist for the executor (`live-ui-identity.md` §5).

---

## 1. Tool resolution

`[AUTOMATION_TOOL]` resolves to **`/playwright-cli`** (`.agents/instructions/agent-tool-resolution.md` §6 Tool Resolution). It is the only browser path: it spawns its own browser per named session, logs in with the declared automation identity, is not bound to the Claude session, and runs the same inside a stage subagent, in Solo mode and on any of the three hosts. The boilerplate ships no browser MCP, so there is nothing to rank it against.

| Tier | Tool | Use | Session-bound? |
| ---- | ---- | --- | -------------- |
| 0 (COMPLEMENT) | **Authenticated HTTP probe** (`[API_TOOL]`) | No browser. Fast inner loop + server-rendered assertions only. **Cannot replace the browser tier**: §7 has the capability boundary. | No |
| 1 (BROWSER) | **Playwright CLI** (`/playwright-cli`) | Every rendered, interactive or visual check, and every screenshot cited as evidence. | No |

Load the owning skill before invoking the binary (`.agents/instructions/agent-tool-resolution.md` §6.5): `playwright-cli` → `/playwright-cli`. That skill owns the HOW of each verb (flags, syntax); §3 owns WHICH session, WHICH identity and how sessions stay apart, because the vendor skill cannot carry this repo's rules.

---

## 2. Flow-aware execution

Validation runs wherever the **active flow mode** runs (the mode is resolved once at Phase 0 and locked for the run — see SKILL.md "Execution mode"):

- **Orchestrated (default)** → live-UI validation happens **inside the stage subagent** that owns it (Stage 2 implementer for the real-time check; the Stage 3 verifier for the final pass).
- **Solo (opt-in)** → live-UI validation happens **inline** in the one session, same stage boundaries.

The flow mode, not the tool, decides where it runs. `/playwright-cli` has no session binding, so there is no exception to place.

---

## 3. Browser sessions

The measurements behind the rules below (what the shipped config isolates, what prints a secret, what a kill reaches) are in `.context/ADR/ADR-0003-forensic-measurements-ledger.md`.

### 3.1 The question before the first `open`

Before the first `open`, answer: **does the page need a logged-in session?** The answer picks exactly one case.

| Case | When | How it starts | How it ends |
|---|---|---|---|
| **(a) anonymous** | public pages, the login page itself, anonymous-redirect checks, anything with no login | `-s=<name> open <url>` | `close` |
| **(b) automation identity** | any screen behind the app's login, as the identity declared in `testing.automation_identity` (§0) | `-s=<name> open`, then log in through the app's own login form (§3.3) | `close` |

There is no third case. The human's own browser, a persistent profile with someone's real accounts in it, and a session borrowed from an already-open tab are all outside the identity contract (`live-ui-identity.md` §1-§3), so this repo never attaches to the human's Chrome and never opens a `--profile`.

The shipped `.playwright/cli.config.json` launches every session **in memory and headless**: no profile on disk, nothing shared between two session names. `--headed` is explicit, and only when a human must watch the window (a demo, a pairing call). `bun sync` delivers that file once when it is missing and never overwrites it: a project keeps the copy it tuned. If a project's copy grows a `userDataDir` or `"isolated": false`, every session name shares one profile and nothing in §3.4 holds: remove both keys with the human's OK before trusting a session name as isolation.

### 3.2 Rules for every session

1. **Always a named session** (`-s=<name>`), never the default one. A story session is named after the ticket (`-s=<KEY>`); a fleet worker after its label; a second identity gets a suffix (`-s=<KEY>-admin`).
2. **Never `--persistent`, never `--profile`.** Both put a browser profile, which is session material, on disk outside the session scratch directory. In-memory is the only mode this repo uses.
3. **One identity = one live browser.** Never two sessions, two subagents or two worktrees logged in as the same account at once: an app with single-session auth silently drops the older one, and the failure reads as a product bug. Subagents that need the same identity run serially; parallel work needs a second declared identity.
4. **Work from `snapshot` refs**, not CSS selectors or coordinates.
5. **`close` is mandatory, even after an error**, and `playwright-cli list` is the proof (Critical Rule #16): your session names absent from the list, not the `close` receipt. Every session closes before its report.
6. **Never `pkill` a browser or the daemon, and never `close-all` / `kill-all`** while any other session may be working: they end every session in the workspace or on the machine, other worktrees included, and flush nothing. Close your own sessions by name.
7. **A stuck `beforeunload`** ("does not handle the modal state") is released with `dialog-accept`. An UNEXPECTED confirmation dialog on a write is `dialog-dismiss` and stop.
8. **Values print by default.** Use `--raw` when a command's output is a value you only compare, and `run-code --filename <file>` for non-trivial code (shell escaping silently breaks large inline snippets).
9. **Evidence goes to an explicit path**: `screenshot --filename <story evidence dir>/<screen>-<state>.png`. Never rely on the default name, which lands in `.playwright/output/` (gitignored) and is shared by every session of the worktree.

### 3.3 Logging in as the automation identity (case b)

The variable NAMES come from `.agents/project.yaml` → `testing.automation_identity` (plus `per_env.<active_env>`); `QA_E2E_USER_*` below are the boilerplate's default names, substitute the project's. Values come from `.env` (Critical Rule #1).

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

- **`--raw fill <ref> "$VAR"` is the only way a credential is typed.** `fill` echoes what it typed in its "Ran Playwright code" block; the shell expands the variable, the command text carries only its NAME, and `--raw` suppresses the echo.
- The variables are never in the agent's own process: the harness is opened bare and holds no `.env` value (ADR-0016). Every command that needs one runs through the loader in a subprocess, `bunx varlock run -- sh -c '...'`, with the single quotes keeping `$VAR` unexpanded until varlock has loaded `.env`.
- After the login, verify WHICH account is signed in (a profile menu, `/me`, the user's email on screen) before trusting any result. A login page after `goto` means the session expired: log in again through the same form, never through a shortcut from `live-ui-identity.md` §3.
- `{{WEB_URL}}` of the active env comes from `.agents/project.yaml`; the real-time check (§5.1) uses the local dev server: `{{stack.package_manager}} run {{stack.scripts.dev}}` from `{{stack.app_root}}`, the name confirmed in the app's `package.json` (AGENTS.md Rule #10).

### 3.4 Session material is a secret

A storage-state file, a cookie value and a request's `Authorization` header are the login in another shape (`live-ui-identity.md` §4).

- **Never print them.** No `cookie-list`, `cookie-get`, `localstorage-list`, `sessionstorage-list`, `request-headers` or `request <n>` on a logged-in session: they print the values. A single non-session key a check needs is read with `--raw ... -get <key>`, never a dump of the store.
- **In-memory needs no cleanup**, which is why it is the default. A `state-save` is only for reusing one login across sessions of the same run, and then: full path inside the session scratch directory (never the repo, never `.auth/`; with no filename it writes `storage-state-<timestamp>.json` into the current directory), `chmod 600` right after, deleted before the report, disclosed as `secrets_materialized: storage-state` + `cleaned: yes`.
- Never photograph a filled password field; capture evidence on screens that do not show the credential.

### 3.5 Fleets and parallel sessions

- **The session namespace is the nearest ancestor directory with a `.playwright/` folder.** Each worktree is its own namespace, so the same `-s` name in two worktrees is two different browsers; `playwright-cli list --all` shows every workspace on the machine. A directory with no `.playwright/` above it falls into one machine-wide default namespace, so run `playwright-cli` from inside the worktree.
- Under the shipped config two session names never share a profile, so **the name IS the isolation**: one name per worker, nothing on disk to clean.
- Rule §3.2.3 binds across the fleet: the orchestrator serializes workers that need the same identity, or declares a second identity for the parallel one.

---

## 4. Per-screen validation checklist

For every screen the story touches, validate the **rendered** result (not the source):

- [ ] **Layout & structure** — matches the screen's intent; no truncation / overflow / clipped controls (e.g. a dropdown that cuts off its options).
- [ ] **Design tokens** — colors, spacing, typography come from `DESIGN.md` (and the frozen-token contract / `master-design-plan.md` §2 when present). No hardcoded hex / off-system spacing.
- [ ] **Live-UI consistency** — consistent with the CURRENT live components + navigation, per the LIVE-UI-FIRST doctrine (AGENTS.md Critical Rule #14). Reuse existing components; do not blind-copy a mockup that conflicts with the improved live UI.
- [ ] **Loading state** — skeleton / spinner renders, no layout shift.
- [ ] **Empty state** — message + CTA present.
- [ ] **Error state** — message + retry path present.
- [ ] **Responsive** — mobile / tablet / desktop breakpoints hold.
- [ ] **AC interactive flows** — every interactive Acceptance Criterion is exercised end-to-end in the running app (click, type, submit, navigate) and observed to work.
- [ ] **Navigation** — how the user reaches and moves through this screen is correct (LIVE-UI-FIRST principle 3: navigation is paramount for UX).

---

## 5. Two patterns + the fix loop

### 5.1 Real-time during implementation (Stage 2)

While building UI, keep the dev server up and re-render after each meaningful change. Catch render bugs **as you code**, not after — tests/types stay green while the pixels are wrong. This often collapses scope: if the live UI already has the affordance the story assumed was greenfield, the task becomes **harden**, not **build** (LIVE-UI-FIRST — inspect + reuse first).

### 5.2 Final verification pass (Stage 3)

Before approving the PR, run a clean pass over all of the story's screens against the §4 checklist (all states, responsive, every interactive AC). Capture evidence into `.session/sprint-development/<KEY>/evidence/` for the Spec Compliance Matrix, and publish what a matrix row cites on the PR or the Jira issue (the session folder is working scratch).

### 5.3 Fix loop (gate)

A UI story **cannot reach merge with an open, unratified live-UI gap.** On any gap:

1. Fix immediately — **Orchestrated**: dispatch a fix subagent (`fix-issues.md`); **Solo**: fix inline.
2. Re-validate the affected screen(s).
3. Repeat until clean, or — for a deliberate, user-approved departure — ratify it as a `master-design-plan.md` §5 divergence (+ ADR if architectural) before approving.

Non-UI stories skip live-UI validation entirely.

**Hard rules (carry from SKILL.md):** NEVER validate against a production build — use the running dev server (`{{stack.scripts.dev}}`, confirmed in the app's `package.json`). Log in as the declared automation identity, resolved by variable name from `.env`, never hardcoded, never bypassing the app's login path (§0 + `live-ui-identity.md`), in a named in-memory `/playwright-cli` session (§3). Before reporting, close every session, delete any session material written to disk and disclose `browser_sessions:` / `secrets_materialized:` / `cleaned:` (§6).

---

## 6. Session checklist before reporting

Every live-UI report (stage subagent or inline Solo stage) carries:

- `browser_sessions:` the `-s` names it opened, and `playwright-cli list` showing none of them open.
- `secrets_materialized:` `none` (in-memory sessions only) or the kinds written (`storage-state`), with `cleaned: yes|no (<reason>)`. `cleaned: no` is a BLOCKER surfaced to the user (AGENTS.md §3, ephemeral-artifact contract).
- The tier that produced each piece of evidence (§7 → Reporting).

---

## 7. Tier 0 — authenticated HTTP probe (sanctioned light path)

Spinning up a full browser for every check is expensive, and a large share of what a server-rendered app does is observable over plain HTTP. A scripted authenticated fetch is a **sanctioned complement** to the browser tiers — never a replacement.

**Shape** (tool-agnostic, `[API_TOOL]`): log in through the app's own login endpoint using the declared automation identity → keep the session (cookie jar / auth header) in the **session scratch directory** → fetch the routes under test → assert on status, redirects, and the server-rendered markup → **delete the session file before reporting**.

The identity contract (§0), the prohibition list, and the ephemeral-artifact contract apply in full. A probe is a login like any other: the same forbidden shortcuts stay forbidden, and a cookie file is exactly the material §0 requires you to clean up.

### Sanctioned for

- Route reachability and HTTP status (200 / 404 / 500 on the story's routes).
- Auth behaviour: protected route redirects when anonymous, reachable when authenticated, correct post-login destination.
- Presence or absence of server-rendered content: a heading, a row, a data-testid, an empty-state string that the server emits.
- Data correctness in the delivered markup (right records, right ordering, right formatting).
- Fast regression re-checks on a route already validated visually, after an unrelated change.
- Non-UI stories that expose an endpoint or an SSR page and never needed the browser tiers.

### NOT sufficient for (browser tier required)

Every item below is in the §4 checklist and cannot be observed over HTTP:

- Layout, spacing, overflow, truncation, clipped controls.
- Design-token conformance as **computed** styles.
- Loading / empty / error states produced by client-side JavaScript after hydration.
- Responsive breakpoints.
- Interactive AC flows (click, type, submit, navigate) and post-hydration behaviour.
- Screenshot evidence for the Spec Compliance Matrix.

**Rule**: Tier 0 may carry the Stage 2 inner loop and non-visual assertions. The **Stage 3 final verification pass on a UI story is always browser-based** (§5.2). A UI story approved on HTTP evidence alone violates S14.

**Reporting**: say which tier produced each piece of evidence. `manual:<path>` rows in the Spec Compliance Matrix that came from a probe are labelled as such, so a reader does not read "verified" as "rendered".
