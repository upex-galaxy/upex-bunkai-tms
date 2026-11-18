# Testability assessment: score and flag the product's testability

> **Purpose**: a `/qa` page is only as useful as the product is testable. Before generating the page, score the three testing layers (UI, API, DB) and flag the deficiencies the team should fix. The skill never blocks on a low score and adapts to whatever exists, but it always surfaces a clear flag and a concrete remediation, so the product becomes more testable over time.
>
> **When to read**: Phase 1 (pre-flight), right after `pre-flight-discovery.md` finishes detection. The assessment consumes the detection results and runs no scans of its own.
>
> **Read-only.** This phase produces flags and recommendations. Auth, endpoints, roles and test code belong to `/project-bootstrap` (infra) and `/sprint-development` (feature).

---

## The core principle

The guide documents how to exercise the app at the DB, API and UI layers. When a tester or an agent cannot exercise a layer programmatically, that layer's guide degrades into prose with no runnable path. Name the gap and recommend the smallest change that restores testability.

A product is testable at a layer when a tester (human or AI agent) can, without insider knowledge:

- **UI**: drive the critical flows with stable selectors (`data-testid` or equivalent) and reach an authenticated state.
- **API**: obtain an auth token programmatically and call protected endpoints as a user, against a discoverable contract (OpenAPI).
- **DB**: inspect state through a read-only role, with the app out of the loop.

When any of these is missing, the page is still built around what exists and a flag fires.

---

## The rubric (score each layer)

Run each layer against the detection results from `pre-flight-discovery.md` and assign one level. The level drives the flag and how that section of the page renders.

### UI testability

| Level | Criteria | Flag + action |
| --- | --- | --- |
| ✅ testable | Critical flows (login at minimum) carry stable `data-testid` or role selectors, and a demo user can reach an authenticated screen. | None. The §6 fixture uses the detected selectors. |
| ⚠️ weak | Some selectors exist but the login or auth flow lacks them, so tests rely on brittle text or CSS. | Flag: "UI selectors partial: login flow lacks stable `data-testid`s." Recommend adding them. §6 renders with a selector-gap note. |
| ❌ deficient | No stable selectors anywhere, so the UI cannot be automated without reverse-engineering. | Flag: "UI not test-ready: no stable selectors." Recommend a `data-testid` convention on key flows. §6 renders the fixture as a template with an explicit "add selectors first" gap. |

### API testability (the highest-leverage layer)

| Level | Criteria | Flag + action |
| --- | --- | --- |
| ✅ testable | A programmatic auth path yields a token for `Authorization: Bearer …` (or equivalent): a password login endpoint, a PAT or API-key issuer, or a service token, with a defined expiry. The OpenAPI contract is discoverable. | None. §5 documents the real flow. |
| ⚠️ weak | A token path exists but is awkward: undiscoverable contract, no expiry control, or only a hybrid or indirect path (for example browser session, then mint a token). | Flag: "API auth works but is indirect: document the bridge; consider a first-class token endpoint." §5 shows the real (possibly hybrid) path. |
| ❌ deficient | No programmatic token path. Auth is passwordless-only (magic-link OTP), OAuth-redirect-only or SSO-only, with no PAT issuer and no password login, so an agent cannot authenticate headlessly. | Flag (high): "API not test-ready: no programmatic auth path." Recommend the canonical pattern below. §5 documents whatever indirect path exists, or marks a gap. |

### DB testability

| Level | Criteria | Flag + action |
| --- | --- | --- |
| ✅ testable | A dedicated read-only QA role (`qa_*`, least privilege) exists for direct inspection. | None. §4 documents it. |
| ⚠️ weak | Only the app's runtime role exists (broad but not superuser), usable read-only with care. | Flag: "No dedicated read-only QA role: inspection uses the app role." Recommend a `qa_inspector_ro`. |
| ❌ deficient | Only a superuser or schema-owner credential exists. | Stop per `security-rules.md` "Hard refusals", rule 1: a superuser credential is never published. Flag it and hand over the `CREATE ROLE qa_inspector_ro …` SQL. The DB publish waits until a read-only role exists. |

---

## The canonical auth-testability remediation

When API testability is ❌ deficient (the most common and most damaging gap, for example a Supabase magic-link-only app or an Auth.js OAuth-only app), recommend the pattern below. Recommend it here and leave the build to the owner skills.

1. **A conventional login** with username or email plus password that works headlessly: no browser, no email round-trip, one request in and a session or token out.
2. **An API auth endpoint that issues a token with a configurable expiry.** The token goes in `Authorization: Bearer <token>` to make requests as that authenticated user. The expiry follows the app's policy (short for CI, longer for exploratory QA), and the token can be scoped.

```
POST /api/<auth>/signin   { email, password }  ->  { token: "<...>", expires_at }
GET  /api/<resource>      Authorization: Bearer <token>   # acts as the user
```

Why this pattern: passwordless, OAuth and SSO leave agents and CI with no headless way in, and a password login plus a token endpoint is the universal escape hatch. It is additive, so the human-facing auth (magic link, SSO) stays untouched. A token with an expiry is safer than a long-lived shared secret and maps onto OpenAPI `securitySchemes` (Bearer).

A product that already ships a PAT (personal access token) issuer satisfies the pattern. Document it and mark API testability ✅ even when the human login is passwordless. That is the common "magic-link UI plus PAT for agents" shape: a programmatic token path exists, so the product is testable. The deficiency fires only when no programmatic path exists at all.

---

## Passwordless is not automatically deficient

Detect the full auth surface before flagging. A project can expose a passwordless UI login and a programmatic token path at the same time:

| Auth surface detected | API testability |
| --- | --- |
| Password login endpoint returning a token | ✅ |
| Passwordless UI (magic link) plus a PAT or token issuer endpoint | ✅ (document the PAT path; UI to API bridge per `page-structure.md` §6) |
| Passwordless UI (magic link) only, no token issuer | ❌ deficient, recommend the pattern above |
| OAuth or SSO redirect only, no token issuer, no password | ❌ deficient, recommend the pattern above |

The §6 "hybrid bridge" (reuse a browser session cookie to mint a token) is ⚠️ weak but working, not ❌. Document it, and note that a first-class token endpoint would upgrade it to ✅.

---

## Output

The assessment returns a compact `testability` block appended to the pre-flight output paragraph (`pre-flight-discovery.md`, Output shape). Example:

```
testability: UI ⚠️ (login has no data-testid) · API ❌ (magic-link only, no token endpoint — recommend password login + token issuer) · DB ✅ (qa_inspector_ro present).
```

Downstream use:

- Surface the flags to the user or orchestrator in the run report, so the team can act on them.
- Record them in the result envelope as `audit.testability-flags` (`security-rules.md`, audit block) so `mem_save` can persist them across runs.
- Carry the worst level into the snapshot field `testability` (`idempotency-snapshot.md`), so a re-run can report whether testability improved or regressed since the last run.
- Page rendering is optional and light. A short "Testabilidad del producto" note (es; "Product testability" in en) in §3 (Trinity) may summarize the weak or deficient layers and the recommendation, so testers see why a layer is hard. The public page stays a one-line health note with a remediation pointer, not a defect list. Detailed flags live in the run report and the gated credentials artifact.

---

## What this phase leaves alone

- It does not implement the login endpoint, token issuer, `data-testid`s or QA role. The one borderline case is adding `data-testid`s to a login form during page generation (`page-structure.md` §6): a surgical, opt-in host edit that unblocks the §6 fixture, never done silently.
- It does not block the run on ⚠️ or ❌, except for the DB superuser refusal in `security-rules.md`. The page is still valuable as a partial guide and a remediation roadmap.
- It does not invent a token path. When API testability is ❌, the §5 page section shows the honest "no programmatic auth path detected, see recommendation" gap, never a made-up endpoint.

---

## Cross-references

- Detection inputs: `pre-flight-discovery.md` (auth model, login endpoint, token shape, docs, DB role, test infra).
- Auth rendering: `page-structure.md` §5 (AuthMethods) and §6 (UI fixture, passwordless branch).
- DB superuser refusal: `security-rules.md` "Hard refusals", rule 1.
- Snapshot field: `idempotency-snapshot.md` (`testability`).
- Remediation owners: `/project-bootstrap` (auth endpoint, token issuer infra), `/sprint-development` (feature level), `/unit-testing` (selectors in tests).
