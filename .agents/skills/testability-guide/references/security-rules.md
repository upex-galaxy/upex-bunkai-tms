# Security rules

> **Purpose**: The rules for both the `/qa` page and the credentials artifact, whichever publisher is used. A secret that slips into either is exposed for good.
>
> **When to read**: Phase 7 of `SKILL.md`, once per run, before any publish call fires. Every publisher adapter applies it too.

---

## Hard refusals (the skill aborts the run)

1. Admin, schema-owner or superuser DB credentials are never published.
   - When the only DB credential available is `postgres`, the schema owner, or a role with `CREATE`, `DROP` or `ALTER` privileges, stop and ask the user to provision a `qa_*` read-only role first. Provide the SQL (`CREATE ROLE qa_user WITH LOGIN PASSWORD '<set this>'; GRANT USAGE ON SCHEMA public TO qa_user; GRANT SELECT ON ALL TABLES IN SCHEMA public TO qa_user;`), adapted to the host's schemas.
   - Provisioning that role is a database change, and this skill does not apply it. It hands over the SQL plus the route `agentic-dev-core/references/db-change-doctrine.md` §2 assigns by `stack.database.migrations_tool`. With `supabase-mcp` or `supabase-cli`, the role (created `NOLOGIN`) and its `GRANT`s go in one named migration (`apply_migration`, for example `create_qa_readonly_role`) on an environment the user confirms for this change. With `prisma` or `drizzle`, they go through the team's own migration pipeline. A person sets the `LOGIN PASSWORD` afterwards (`ALTER ROLE … WITH LOGIN PASSWORD …` in the SQL editor), never through the MCP and never inside a migration, because the migration history would keep the password in clear. The password then lives only in the credentials artifact destination (T1).
   - If the user insists, state the risk and ask for written confirmation in chat. The skill still refuses to write the superuser credential into the artifact body.
2. Session-signing secrets are never published: `NEXTAUTH_SECRET`, JWT signing keys (`JWT_SECRET`, `SESSION_SECRET` and similar), refresh-token signing keys, and OAuth client secrets meant for server-side use only.
   - When any of these appears in `.env.example` with a non-empty default, stop, flag the exposure in git history, and recommend rotation before the publish proceeds.
3. Production database write credentials are never published. Only the read-only role goes into the artifact, and writes go through the API.
4. A credential already exposed in git history is not republished without rotation.
   - Run `git log -p -- .env.example` and `git log -p -- '*credentials*'` during pre-flight. When a real-looking secret appears, stop and recommend rotation.

A refusal stops the run at the publish step. A person present decides the next move, and a supervised worker's conductor holds it. With nobody there, finish the reversible work (page code, artifact body with `<see secrets store>` placeholders), skip the publish call, and record the refusal in the audit block (`superuser-refused` or `rotation-required` set to `true`).

---

## Page-side rules (the in-app `/qa` page)

- The page source holds no real DB or API credentials. The page only points at the credentials artifact.
- Demo-user password policy (it resolves the page's §7 quick-reference table):
  - Shared demo accounts with intentionally public scope (a practice or demo platform where low-friction access is the point) may show their password inline.
  - Real per-tester credentials (any account with real-data reach or a per-person identity) are never inlined. The page shows emails only, and the passwords sit gated in the credentials artifact.
  - When unsure, default to gated (emails only); pre-flight and the project context (public practice platform or internal tool) decide.
- Private hostnames (`<random>.upexgalaxy.com`-shaped names, customer-specific subdomains) stay off the page. They live in the credentials artifact.
- The build stamp shows the short commit SHA (and a commit link from `.agents/project.yaml`) and nothing else. A commit SHA is public-safe, but the platform variables around it are not all safe, so no other platform env value (commit message, author, `VERCEL_AUTOMATION_BYPASS_SECRET`, and so on) is rendered next to it.
- `/qa` gets no analytics, tracking pixels or third-party scripts. The page is operational tooling, not a marketing surface.
- The credentials destination URL stays out of `.env`. It goes in the snapshot comment, which is committed, and that is intentional: the destination URL is access-gated by the destination's own permission model.

---

## Artifact-side rules (the markdown body, whichever publisher)

- Use the literal token `<see secrets store>` for any value the skill must not transmit to the destination automatically. The user fills it in inside the destination tool (Jira, Confluence, Notion and so on), where the audit trail lives.
- The artifact body is committed to no part of the host repo. The skill renders it during the publish step and never writes it to the host project's filesystem.
- The credentials destination must be access-gated by its native permission model:
  - Jira: restrict view permissions on the Epic.
  - Confluence: page-level restrictions to the QA group.
  - Notion: share to specific people only.
  - Manual paste: the destination URL the user names must be access-gated, and the skill warns when the URL pattern suggests a public surface (no `/private/` or `/internal/` segment, no SSO host).

---

## MCP credential failure protocol (Critical Rule 9)

When any MCP used for publish (Atlassian, Notion, custom) returns `401` or `403` or fails to authenticate, stop. The manual-paste fallback never starts on its own, because it would hide the failure: manual paste is a deliberate Q1 choice, not an error handler.

- Identify the exact env var the MCP needs (its server-side config or docs say which).
- Point the user at that variable, ask them to update `.env`, and ask them to restart the agent session, since env vars are cached at MCP-spawn time.
- With nobody at the keyboard, end the publish step there: the report names the variable and the restart.

---

## Pre-publish checklist (run mentally before any publish call)

- [ ] No admin, superuser or schema-owner credential in the artifact body.
- [ ] No session-signing secret in the artifact body.
- [ ] No production write credential in the artifact body.
- [ ] No private hostname in the in-app page source.
- [ ] No real password in the page or the repo (`git diff` clean).
- [ ] The credentials destination has access gating.
- [ ] MCP or CLI authentication succeeded for the chosen publisher.
- [ ] Any credential previously exposed in git history has been rotated.

If any box is unchecked, stop, surface it to the user, and do not publish.

---

## Audit trail

After every run the skill writes a short audit summary to the orchestrator's result envelope:

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
  testability-remediation: "auth has no programmatic token path; recommend password login + token endpoint with expiry"
```

The orchestrator can persist this with `mem_save` (Engram) for cross-session continuity.
