# Automation identity — the credential contract for driving the running app

> Owned by `/sprint-development`. Binds EVERY path that authenticates against a running application on behalf of a user: live-UI validation (`live-ui-validation.md`), authenticated HTTP probes (Tier 0), smoke checks, and any subagent dispatched to do either.
>
> This file states a CONTRACT and a PROHIBITION LIST, not a preference. "Use credentials from `.env`" was too weak: it says where values live, not WHICH identity is legitimate nor which shortcuts are forbidden. Both gaps were filled by improvisation in practice.

---

## 1. The contract

A project declares exactly one automation identity per environment, by NAME, in `.agents/project.yaml`:

```yaml
testing:
  automation_identity:
    email_var: QA_E2E_USER_EMAIL # env var NAME, not a value
    password_var: QA_E2E_USER_PASSWORD
    scope: dedicated-non-production-account
    per_env: {} # optional: { <env>: { email_var, password_var } }
```

Resolution order, every run:

1. Read `.agents/project.yaml` → `testing.automation_identity`.
2. If `per_env.<active_env>` exists, its `email_var` / `password_var` win for that environment.
3. Resolve those NAMES against `.env` at runtime. Values never appear in this file, in a plan, in a report, or in a commit.

The variable names are the project's choice. The skills never assume a name — `QA_E2E_USER_EMAIL` above is an EXAMPLE, not a required spelling. What is fixed is the shape: a declared slot, resolved by name, holding a non-privileged account.

### Valid `scope` values

| `scope` | Meaning | When it is acceptable |
| ------- | ------- | --------------------- |
| `dedicated-non-production-account` | An account provisioned solely for automation, in a non-production environment, owned by no real person. | Default. Prefer this always. |
| `shared-demo-account` | A shared low-privilege demo account whose access is intentionally public (practice/demo products). | Only when the product's threat model already treats that account as public. |

Anything else is NOT a valid automation identity: a real user's account, a staff/admin/support account, an account with production data reach, the project owner's own login, or an account created ad hoc during the run.

---

## 2. Fail-closed gate (hard)

If `email_var` or `password_var` is null / absent, OR the named variable is missing from `.env`, OR `scope` is unset:

**STOP before any authenticated action.** Report the exact missing slot and what to provision. Then wait.

Explicitly forbidden as a workaround: picking a different account "that looks like a test user", reading accounts out of the database to find one, creating an account mid-run, reusing an already-open browser session belonging to the human, or falling back to a privileged path from §3.

A missing identity is a project-setup gap the user resolves once. It is never resolved by the agent at runtime.

---

## 3. Prohibition list — never bypass the app's own login

The identity must authenticate through the SAME login path a real user takes: the application's login form or its public authentication endpoint. Any mechanism that mints, forges, or borrows a session while skipping that path is FORBIDDEN, with no exception and no "just for this check".

Stated by capability, so it holds on any stack:

- **Privileged service credentials** used to obtain a session: service-role / secret / admin API keys, backend-only tokens, machine credentials. (Supabase `SERVICE_ROLE` / secret key, Firebase Admin SDK, an AWS admin profile, a root DB role — same category.)
- **Administrative user-management APIs**: listing, searching, or enumerating real users; creating, mutating, or deleting accounts; reading or resetting another account's password.
- **Out-of-band session minting**: generating magic links / one-time login links / password-reset tokens for an account, signing a JWT locally, writing a session row directly into the database, or crafting a session cookie by hand.
- **Impersonation**: acting as any account that is not the declared automation identity, including "just to see the screen as an admin". If a story needs a privileged view, the project provisions a dedicated non-production account WITH that role and declares it (via `per_env` or a second identity slot); it does not borrow a real one.
- **Production identities**, in any environment, for any reason.

If a check appears to require one of these, that is a finding to surface, not a step to take: the story either needs a provisioned role account, or the app lacks a testable auth path (see the testability assessment in `/testability-guide`).

---

## 4. Secret hygiene (inherits the ephemeral-artifact contract)

Logging in produces session material. It is bound by the ephemeral-artifact contract in `agentic-dev-core/references/orchestration-doctrine.md`:

- Cookie jars, `storageState.json`, saved auth state, bearer-token files, `.har` captures: session-scratch directory only, never the repo tree.
- Deleted before the subagent (or the inline stage, in Solo mode) reports.
- Report carries `secrets_materialized:` + `cleaned:`.
- The password NEVER appears in a script committed to the repo, a screenshot, a log line, a plan, a PR body, or a tracker comment. Scripts read `process.env.<NAME>`; the name is committable, the value is not.

Screenshots are evidence and DO belong in the story's `evidence/` folder — but capture them on screens that do not display the credential, and never photograph a filled password field.

---

## 5. Dispatch requirements (how this rule reaches the executor)

Live-UI work is normally done by a stage subagent, which does not read this file unless told to. Per `orchestration-doctrine.md` → "Rule reachability", every dispatch that authenticates against a running app MUST carry, in briefing component 7 (Rules):

1. The resolved identity, BY VARIABLE NAME (`log in with process.env.<EMAIL_VAR> / <PASSWORD_VAR>`), never the value.
2. The §3 prohibition list, restated — at minimum: "never obtain a session through a privileged key, an admin/user-management API, a generated link, a hand-crafted token, or any account other than the declared identity; if the declared identity fails, STOP and report".
3. The §4 hygiene contract plus the two mandatory report fields.

An orchestrator that dispatches live-UI work without these three lines has not delegated the rule, and the executor is free to improvise. That is the failure this contract exists to close.

---

## 6. Provisioning checklist (one-time, per project)

- [ ] A dedicated account exists in each non-production environment that automation touches.
- [ ] Its privileges are the minimum the acceptance criteria need. A second, separately declared account covers privileged-role screens if the backlog requires them.
- [ ] Its credentials are in `.env` under project-chosen names, and those names are declared in `testing.automation_identity` in `.agents/project.yaml`.
- [ ] The names are registered in `cli/lib/variables-manifest.ts`, so `bun run vars:check` / the doctor flag them BEFORE a sprint rather than mid-run.
- [ ] `.env.example` documents the names with empty values.
- [ ] The account is not reachable in production and holds no real customer data.
