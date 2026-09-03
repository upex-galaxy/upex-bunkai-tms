# Testability Assessment — score + flag the product's testability

> **Purpose**: A `/qa` page is only as useful as the product is *testable*. Before generating the page, score the three testing layers (UI / API / DB) and **flag deficiencies** the team should fix. The skill never blocks on a low score — it adapts to whatever exists — but it MUST surface a clear flag + a concrete remediation so the product becomes more testable over time.
>
> **When to read**: Phase 1 (pre-flight), immediately AFTER `pre-flight-discovery.md` finishes detection. The assessment consumes the detection results; it does not run its own scans.
>
> **Read-only.** This phase produces flags + recommendations. It NEVER implements auth, endpoints, roles, or test code — that is `/project-bootstrap` (infra) or `/sprint-development` (feature) work. Flagging ≠ building.

---

## The core principle

The guide documents how to exercise the app at the DB, API, and UI layers. If a layer cannot be exercised **programmatically by a tester or an agent**, the guide for that layer degrades into prose with no runnable path. Detect that gap, name it, and recommend the smallest change that restores testability.

A product is "testable" at a layer when a tester (human OR AI agent) can, without insider knowledge:

- **UI** — drive the critical flows with **stable selectors** (`data-testid` or equivalent) and reach an authenticated state.
- **API** — obtain an **auth token programmatically** and call protected endpoints as a user, against a discoverable contract (OpenAPI).
- **DB** — inspect state through a **read-only role** without the app in the loop.

When any of these is missing, the page still gets built (adapt to what exists) — but a flag fires.

---

## The rubric (score each layer)

Run each layer against the detection results from `pre-flight-discovery.md`. Assign one level. The level drives the flag + the page rendering for that section.

### UI testability

| Level | Criteria | Flag + action |
| --- | --- | --- |
| ✅ testable | Critical flows (login at minimum) carry stable `data-testid` / role selectors; a demo user can reach an authenticated screen. | None. §6 fixture uses the detected selectors. |
| ⚠️ weak | Some selectors exist but the login/auth flow lacks them; tests must rely on brittle text/CSS. | Flag: "UI selectors partial — login flow lacks stable `data-testid`s." Recommend adding them. §6 renders with a selector-gap note. |
| ❌ deficient | No stable selectors anywhere; UI is unautomatable without reverse-engineering. | Flag: "UI not test-ready — no stable selectors." Recommend a `data-testid` convention on key flows. §6 renders the fixture as a TEMPLATE with an explicit "add selectors first" gap. |

### API testability (the highest-leverage layer)

| Level | Criteria | Flag + action |
| --- | --- | --- |
| ✅ testable | A **programmatic auth path** yields a token for `Authorization: Bearer …` (or equivalent): a password login endpoint, a PAT/API-key issuer, or a service token — with a defined expiry. OpenAPI/contract is discoverable. | None. §5 documents the real flow. |
| ⚠️ weak | A token path exists but is awkward: undiscoverable contract, no expiry control, or only a hybrid/indirect path (e.g. browser-session → mint token). | Flag: "API auth works but is indirect — document the bridge; consider a first-class token endpoint." §5 shows the real (possibly hybrid) path. |
| ❌ deficient | **No programmatic token path.** Auth is passwordless-only (magic-link OTP), OAuth-redirect-only, or SSO-only, with no PAT issuer and no password login. An agent cannot authenticate headlessly. | **Flag (high): "API not test-ready — no programmatic auth path."** Recommend the canonical auth-testability pattern below. §5 documents whatever indirect path exists (or marks a gap). |

### DB testability

| Level | Criteria | Flag + action |
| --- | --- | --- |
| ✅ testable | A dedicated **read-only QA role** (`qa_*` / least-privilege) exists for direct inspection. | None. §4 documents it. |
| ⚠️ weak | Only the app's runtime role exists (broad but not superuser); usable read-only with care. | Flag: "No dedicated read-only QA role — inspection uses the app role." Recommend a `qa_inspector_ro`. |
| ❌ deficient | Only a superuser / schema-owner credential exists. | **STOP per `security-rules.md` §1** — never publish a superuser credential. Flag + provide the `CREATE ROLE qa_inspector_ro …` SQL; do not proceed with DB publish until a read-only role exists. |

---

## The canonical auth-testability remediation

When **API testability is ❌ deficient** (the most common and most damaging gap — e.g. a Supabase magic-link-only app, or an Auth.js OAuth-only app), recommend this pattern. It is the most normal and practical baseline for making any product testable. **Recommend it; do not build it here.**

1. **A conventional login** — username/email + password — that works **headlessly** (no browser, no email round-trip). One request in, a session/token out.
2. **An API auth endpoint that issues a token with a configurable expiry.** The token is used in `Authorization: Bearer <token>` to make requests **as that authenticated user**. Expiry is set per the app's policy (short-lived for CI, longer for exploratory QA). Optionally scoped.

```
POST /api/<auth>/signin   { email, password }  ->  { token: "<...>", expires_at }
GET  /api/<resource>      Authorization: Bearer <token>   # acts as the user
```

Why this and not a workaround:

- Passwordless / OAuth / SSO are great for humans but leave agents and CI with no headless entry. A password login + token endpoint is the universal escape hatch.
- It keeps the human-facing auth (magic-link, SSO) untouched — the token path is **additive**, for testing and automation, not a replacement.
- A token with expiry is safer than a long-lived shared secret and maps cleanly onto OpenAPI `securitySchemes` (Bearer).

If the product already ships a **PAT / personal-access-token** issuer, that satisfies the pattern — document it and mark API testability ✅, even if the human login is passwordless. (This is the common "magic-link UI + PAT for agents" shape: human auth is passwordless, but a programmatic token path exists → testable. The deficiency only fires when NO programmatic path exists at all.)

---

## Passwordless ≠ automatically deficient

Detect the FULL auth surface before flagging. A project can expose passwordless UI login AND a programmatic token path at the same time:

| Auth surface detected | API testability |
| --- | --- |
| Password login endpoint returning a token | ✅ |
| Passwordless UI (magic-link) **+** PAT/token issuer endpoint | ✅ (document the PAT path; UI→API bridge per `page-structure.md` §6) |
| Passwordless UI (magic-link) only, no token issuer | ❌ deficient → recommend the pattern above |
| OAuth/SSO redirect only, no token issuer, no password | ❌ deficient → recommend the pattern above |

The §6 "hybrid bridge" (reuse a browser session cookie to mint a token) is a ⚠️ *weak-but-works* path, not a ❌ — document it, and note that a first-class token endpoint would upgrade it to ✅.

---

## Output

The assessment returns a compact `testability` block appended to the pre-flight output paragraph (`pre-flight-discovery.md` §Output shape). Example:

```
testability: UI ⚠️ (login has no data-testid) · API ❌ (magic-link only, no token endpoint — recommend password login + token issuer) · DB ✅ (qa_inspector_ro present).
```

Downstream consumption:

- **Always** surface the flags to the user/orchestrator in the run report (this is the point — the team acts on it).
- Record into the result envelope `audit.testability-flags` (per `security-rules.md` audit block) so `mem_save` can persist them across runs.
- Carry the worst level into the snapshot field `testability` (see `idempotency-snapshot.md`) so a re-run can report "testability improved / regressed since last run."
- **Page rendering is optional and tasteful**: a short "Testabilidad del producto" note in §3 (Trinity) MAY summarize weak/deficient layers + the recommendation, so QA understands why a layer is hard. Do NOT turn the public page into a defect list — keep it a one-line health note + the remediation pointer. Detailed flags live in the run report + the gated credentials artifact, not splashed on a public page.

---

## What this phase must NOT do

- Do NOT implement the login endpoint, token issuer, `data-testid`s, or QA role. Flag + recommend only. (Adding `data-testid`s to a login form during page-gen is the one borderline case — see `page-structure.md` §6: allowed as a surgical, opt-in host edit when it unblocks the §6 fixture, never silently.)
- Do NOT block the run on ⚠️ or ❌ (except the DB-superuser hard refusal in `security-rules.md`). The page is still valuable as a partial guide + a remediation roadmap.
- Do NOT fabricate a token path that does not exist. If API testability is ❌, the §5 page section renders the honest "no programmatic auth path detected — see recommendation" gap, never an invented endpoint.

---

## Cross-references

- Detection inputs: `pre-flight-discovery.md` (auth model, login endpoint, token shape, docs, DB role, test infra).
- Auth rendering: `page-structure.md` §5 (AuthMethods) + §6 (UI fixture, passwordless branch).
- DB superuser refusal: `security-rules.md` §1.
- Snapshot field: `idempotency-snapshot.md` (`testability`).
- Remediation owners: `/project-bootstrap` (auth endpoint, token issuer infra) · `/sprint-development` (feature-level) · `/unit-testing` (selectors in tests).
