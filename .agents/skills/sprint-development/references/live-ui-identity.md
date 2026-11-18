# Automation identity: the credential contract for driving the running app

> Owned by `/sprint-development`. It binds every path that authenticates against a running application on behalf of a user: live-UI validation (`live-ui-validation.md`), authenticated HTTP probes (Tier 0), smoke checks, and any subagent dispatched to do either.
>
> This file is a contract and a prohibition list. "Use credentials from `.env`" was too weak: it says where values live, but not which identity is legitimate or which shortcuts are forbidden, and agents filled both gaps by improvising.

---

## 1. The contract

A project declares exactly one automation identity per environment, by name, in `.agents/project.yaml`:

```yaml
testing:
  automation_identity:
    email_var: QA_E2E_USER_EMAIL # env var NAME, not a value
    password_var: QA_E2E_USER_PASSWORD
    scope: dedicated-non-production-account
    per_env: {} # optional: { <env>: { email_var, password_var } }
```

Resolve it in this order, every run:

1. Read `testing.automation_identity` in `.agents/project.yaml`.
2. If `per_env.<active_env>` exists, its `email_var` and `password_var` win for that environment.
3. Resolve those names against `.env` at runtime. Values never appear in this file, a plan, a report or a commit.

The variable names are the project's choice, and the skills assume none: `QA_E2E_USER_EMAIL` above is an example, not a required spelling. What is fixed is the shape, a declared slot resolved by name that holds a non-privileged account.

### Valid `scope` values

| `scope` | Meaning | When it is acceptable |
| ------- | ------- | --------------------- |
| `dedicated-non-production-account` | An account provisioned solely for automation, in a non-production environment, owned by no real person. | The default. Prefer it always. |
| `shared-demo-account` | A shared low-privilege demo account whose access is intentionally public (practice or demo products). | Only when the product's threat model already treats that account as public. |

Anything else is not a valid automation identity: a real user's account, a staff, admin or support account, an account with production data reach, the project owner's own login, or an account created ad hoc during the run.

---

## 2. Fail-closed gate

The gate trips when `email_var` or `password_var` is null or absent, when the named variable is missing from `.env`, or when `scope` is unset. Stop before any authenticated action and report the exact missing slot and what to provision. A person present provisions it and the run resumes. A supervised worker reports `BLOCKED: identity` to its conductor (`fleet-mode.md` §9), and a run with nobody at the keyboard reports the same gap and does the work that needs no login.

These are not workarounds, whatever the pressure to finish: picking a different account that looks like a test user, reading accounts out of the database to find one, creating an account mid-run, reusing a browser session the human already has open, and falling back to a privileged path from §3. A missing identity is a project-setup gap that the user resolves once. The agent never resolves it at runtime.

---

## 3. Prohibition list: never bypass the app's own login

The identity authenticates through the same login path a real user takes: the application's login form or its public authentication endpoint. Any mechanism that mints, forges or borrows a session while skipping that path is forbidden, with no exception and no "just for this check". A bypassed login also proves nothing about the login the users see.

The list is stated by capability, so it holds on any stack:

- Privileged service credentials used to obtain a session: service-role, secret or admin API keys, backend-only tokens, machine credentials. (A Supabase `SERVICE_ROLE` or secret key, the Firebase Admin SDK, an AWS admin profile and a root DB role are all the same category.)
- Administrative user-management APIs: listing, searching or enumerating real users; creating, mutating or deleting accounts; reading or resetting another account's password.
- Out-of-band session minting: generating magic links, one-time login links or password-reset tokens for an account, signing a JWT locally, writing a session row directly into the database, or crafting a session cookie by hand.
- Impersonation: acting as any account that is not the declared automation identity, including "just to see the screen as an admin". When a story needs a privileged view, the project provisions a dedicated non-production account with that role and declares it (via `per_env` or a second identity slot). It does not borrow a real one.
- Production identities, in any environment, for any reason.

If a check seems to need one of these, surface it as a finding. The story either needs a provisioned role account, or the app lacks a testable auth path (see the testability assessment in `/testability-guide`).

---

## 4. Secret hygiene (inherits the ephemeral-artifact contract)

Logging in produces session material, and the ephemeral-artifact contract in `agentic-dev-core/references/orchestration-doctrine.md` binds it:

- Cookie jars, `storageState.json`, saved auth state, bearer-token files and `.har` captures live in the session-scratch directory only, never in the repo tree.
- They are deleted before the subagent (or the inline stage, in Solo mode) reports.
- The report carries `secrets_materialized:` and `cleaned:`.
- The password never appears in a script committed to the repo, a screenshot, a log line, a plan, a PR body or a tracker comment. Scripts read `process.env.<NAME>`. The name is committable and the value is not.

Screenshots are evidence and belong in the story's evidence (working copy in `.session/sprint-development/<KEY>/evidence/`, durable copy on the PR or the Jira issue). Capture them on screens that do not display the credential, and never photograph a filled password field.

---

## 5. Dispatch requirements: how this rule reaches the executor

A stage subagent usually does the live-UI work, and it does not read this file unless told to. Per `orchestration-doctrine.md` ("Rule reachability"), every dispatch that authenticates against a running app carries these four items in briefing component 7 (Rules):

1. The resolved identity, by variable name (`log in with process.env.<EMAIL_VAR> / <PASSWORD_VAR>`), never the value.
2. The §3 prohibition list, restated. At minimum: "never obtain a session through a privileged key, an admin or user-management API, a generated link, a hand-crafted token, or any account other than the declared identity; if the declared identity fails, STOP and report".
3. The §4 hygiene contract plus the two mandatory report fields.
4. The browser-session rules: one named in-memory `/playwright-cli` session per identity, credentials typed only as `--raw fill <ref> "$VAR"`, and every session closed before reporting with `playwright-cli list` as proof (`live-ui-validation.md` §3, §6).

An orchestrator that dispatches live-UI work without these four lines has not delegated the rule, and the executor is free to improvise. This contract exists to close that gap.

---

## 6. Provisioning checklist (one-time, per project)

- [ ] A dedicated account exists in each non-production environment that automation touches.
- [ ] Its privileges are the minimum the acceptance criteria need. A second, separately declared account covers privileged-role screens if the backlog requires them.
- [ ] Its credentials are in `.env` under project-chosen names, and those names are declared in `testing.automation_identity` in `.agents/project.yaml`.
- [ ] The names are registered in `cli/lib/variables-manifest.ts`, so `bun run vars:check` and the doctor flag them before a sprint rather than mid-run.
- [ ] `.env.example` documents the names with empty values.
- [ ] The account is not reachable in production and holds no real customer data.
