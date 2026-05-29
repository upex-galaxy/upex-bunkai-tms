# Security Rules

> **Purpose**: Non-negotiables that apply to BOTH the `/qa` page and the credentials artifact, regardless of publisher. Read once per run, before any publish call fires.
>
> **When to read**: Phase 7 of `SKILL.md`. Also re-applied to every publisher adapter — adapters cannot opt out.

---

## Hard refusals (the skill aborts the run)

1. **Admin / schema-owner / superuser DB credentials are NEVER published.**
   - If the only DB credential available is `postgres` / schema owner / a role with `CREATE` / `DROP` / `ALTER` privileges → STOP. Ask the user to provision a `qa_*` read-only role first. Provide the SQL (`CREATE ROLE qa_user WITH LOGIN PASSWORD '<set this>'; GRANT USAGE ON SCHEMA public TO qa_user; GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_user;` — adapt to the host's schemas).
   - If the user insists, surface the risk explicitly and ask for written confirmation in chat. The skill still refuses to write the superuser credential into the artifact body.
2. **Session-signing secrets are NEVER published.**
   - `NEXTAUTH_SECRET`, JWT signing keys (`JWT_SECRET`, `SESSION_SECRET`, etc.), refresh-token signing keys, OAuth client secrets meant for server-side use only.
   - If any of these appear in `.env.example` with a non-empty default value → STOP and flag exposure in git history. Recommend rotation BEFORE the publish proceeds.
3. **Production database write credentials are NEVER published.**
   - Only the read-only role goes into the artifact. Writes go through the API.
4. **Credentials already exposed in git history are NEVER republished without rotation.**
   - Run `git log -p -- .env.example` and `git log -p -- '*credentials*'` during pre-flight. If a real-looking secret appears → STOP. Recommend rotation.

---

## Page-side rules (the in-app `/qa` page)

- NEVER inline real DB / API credentials in the page source. The page only points at the credentials artifact.
- Demo-user password policy (resolves the page §7 quick-reference table):
  - **Shared demo accounts with intentionally-public scope** (e.g. a practice/demo platform where the whole point is low-friction access) MAY show their password inline. Their scope is deliberately limited and the knowledge is intentionally shared — that is the threat model.
  - **Real per-tester credentials** (any account with real-data reach or per-person identity) are NEVER inlined — emails only on the page, passwords gated in the credentials artifact.
  - When unsure which case applies → default to gated (emails only). Pre-flight + project context (public practice/demo vs internal tool) decides.
- Private hostnames (e.g. `<random>.upexgalaxy.com`-shaped, customer-specific subdomains) NEVER on the page. They live in the credentials artifact.
- NEVER add analytics, tracking pixels, or third-party scripts to `/qa`. The page is operational tooling, not a marketing surface.
- NEVER store the credentials destination URL in `.env`. It goes in the snapshot comment (which is committed) — and that is intentional, because the destination URL itself is access-gated by the destination's permission model.

---

## Artifact-side rules (the markdown body, regardless of publisher)

- Use the literal token `<see secrets store>` for any value that must not be transmitted from the skill to the destination automatically. The user fills it in inside the destination tool (Jira / Confluence / Notion / etc.) where the audit trail lives.
- The artifact body is committed to NO part of the host repo. The skill renders it during the publish step and never writes it to the filesystem of the host project.
- The credentials destination MUST be access-gated by its native permission model:
  - Jira: restrict view permissions on the Epic.
  - Confluence: page-level restrictions to the QA group.
  - Notion: share-to-specific-people only.
  - Manual paste: the destination URL the user names must be access-gated; the skill warns when the URL pattern suggests a public surface (no `/private/` / `/internal/` segment, no SSO host).

---

## MCP credential failure protocol (mirrors CLAUDE.md Rule #11)

If any MCP used for publish (Atlassian, Notion, custom) returns `401` / `403` or fails to authenticate:

- STOP. Do not work around.
- Identify the exact env var the MCP needs (read its server-side config / docs).
- Point the user at the variable + ask them to update `.env` + **restart the agent session** (env vars are cached at MCP-spawn time).
- Do NOT continue with manual-paste fallback automatically — that hides the real issue. Manual-paste is a deliberate Q1 choice, not an error-handler.

---

## Pre-publish checklist (run mentally before any publish call)

- [ ] No admin / superuser / schema-owner credential in the artifact body.
- [ ] No session-signing secret in the artifact body.
- [ ] No production write credential in the artifact body.
- [ ] No private hostname in the in-app page source.
- [ ] No real password in the page or the repo (`git diff` clean).
- [ ] Credentials destination has access gating.
- [ ] MCP / CLI authentication succeeded for the chosen publisher.
- [ ] Any credentials previously exposed in git history have been rotated.

If any box is unchecked → STOP, surface to user, do NOT publish.

---

## Audit trail

The skill writes a short audit summary to the orchestrator's result envelope after every run:

```
audit:
  publisher: jira-epic
  artifact-url: https://upex.atlassian.net/browse/UPEX-321
  page-route: /qa
  superuser-refused: false
  rotation-required: false
  manual-fallback: false
  content-hash: sha256:…
  testability-flags: "UI:weak API:deficient DB:ok"   # from references/testability-assessment.md
  testability-remediation: "auth has no programmatic token path — recommend password login + token endpoint with expiry"
```

The orchestrator can persist this via `mem_save` (Engram) for cross-session continuity, per the boilerplate's PROACTIVE SAVE protocol.
