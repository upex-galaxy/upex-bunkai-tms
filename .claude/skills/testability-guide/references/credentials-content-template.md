# Credentials Content Template — SOURCE OF TRUTH

> **Purpose**: The canonical markdown body of the credentials artifact. Publisher-specific files in `publishers/` are thin adapters around this template — they describe HOW to publish, not WHAT to publish.
>
> **When to read**: Phase 5 of `SKILL.md`. The orchestrator builds this body once, then routes it to the destination chosen in Q1.
>
> **Author once, publish anywhere**: the body below is intentionally framework-neutral. Each publisher converts heading / code-block syntax as needed (e.g. Jira wiki markup, Confluence Code Block macro, Notion code block).

---

## Required sections (in order)

1. **Title + audience**
2. **Architecture summary** — one-paragraph mirror of the page's §3, so the artifact stands alone if a tester finds it without the page.
3. **Environment table** — per environment (staging, production, etc), the web URL, API URL, OpenAPI spec URL, Swagger UI URL. Read from `.agents/project.yaml` `environments`.
4. **Database access** — connection-string snippet, host, port, database, user, password placeholders, sslmode. ONE snippet per credential so the publisher can render one copy button per value.
5. **API access** — login endpoint per environment, login body for each demo user, sample `curl`, OpenAPI spec URL.
6. **UI access** — login URL per environment, each demo user's email and password as separate snippets.
7. **Footer** — direct link BACK to the in-app `/qa` page so testers know where to find the operational docs.

---

## Snippet rules

- **One credential = one snippet.** Never group two values inside the same code fence — publishers render one copy button per snippet, and a grouped block defeats the UX.
- Use generic code-fence syntax (```) in the template. Each publisher adapter converts to its native syntax (`{noformat}` for Jira, `Code Block` macro for Confluence, `` ``` `` for Notion).
- Never put real passwords inside this file. The template is committed; real values are filled at publish-time from `.env` / Supabase / the project's secrets store.
- Use `<see secrets store>` for any value the AI must not see at all (production passwords).

---

## Template body (literal — copy into the publisher adapter, then substitute placeholders)

> The placeholders use the project's `{{VAR_NAME}}` / `{{environments.<env>.<var>}}` syntax from `.agents/project.yaml`. The publish step resolves them.

```markdown
# {{PROJECT_NAME}} — QA Testing Credentials (DB / API / UI)

> Audience: Manual QA + AI-driven testers (Claude Code, Cursor, etc.) who need to exercise this application at the DB, API, and UI layers.
> Companion page (in-app): {{WEB_URL}}/qa

## Architecture summary

{{PROJECT_NAME}} is a {{FRONTEND_STACK}} client + {{BACKEND_STACK}} API + {{DB_TYPE}} database. Tenant isolation is enforced at the API layer; the DB role exposed below has SELECT-only privileges on the relevant schemas.

## Environments

| Env        | Web URL                             | API URL                             | OpenAPI spec                                         | Swagger UI                                   |
| ---------- | ----------------------------------- | ----------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| Staging    | {{environments.staging.WEB_URL}}    | {{environments.staging.API_URL}}    | {{environments.staging.API_URL}}/api/openapi.json    | {{environments.staging.API_URL}}/api/docs    |
| Production | {{environments.production.WEB_URL}} | {{environments.production.API_URL}} | {{environments.production.API_URL}}/api/openapi.json | {{environments.production.API_URL}}/api/docs |

## Database access (read-only QA role)

Connection string (one copy per env — pick the right one):
```

postgresql://qa_user:<see secrets store>@<host>:5432/<db>?sslmode=require

```

Host:

```

<host>
```

Port:

```
5432
```

Database:

```
<db>
```

User:

```
qa_user
```

Password:

```
<see secrets store>
```

SSL mode:

```
require
```

## API access

Login endpoint (staging):

```
POST {{environments.staging.API_URL}}/api/auth/callback/credentials
```

Login body for demo user `qa+1@example.com`:

```json
{ "email": "qa+1@example.com", "password": "<see secrets store>" }
```

Sample `curl`:

```bash
curl -sS -X POST {{environments.staging.API_URL}}/api/auth/callback/credentials \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa+1@example.com","password":"<see secrets store>"}'
```

OpenAPI spec URL (staging):

```
{{environments.staging.API_URL}}/api/openapi.json
```

Swagger UI (staging):

```
{{environments.staging.API_URL}}/api/docs
```

## UI access — demo users

| Email              | Password              | Notes                   |
| ------------------ | --------------------- | ----------------------- |
| `qa+1@example.com` | `<see secrets store>` | Tenant A — default role |
| `qa+2@example.com` | `<see secrets store>` | Tenant A — admin role   |
| `qa+3@example.com` | `<see secrets store>` | Tenant B — default role |

Login URL (staging):

```
{{environments.staging.WEB_URL}}/login
```

Login URL (production):

```
{{environments.production.WEB_URL}}/login
```

## Footer

Operational docs (architecture, MCP setup, Playwright snippets) live at the in-app page:

```
{{WEB_URL}}/qa
```

If anything in this artifact is out of date, re-run `/testability-guide` against the project repo.

```

---

## Substitution rules (publish-time)

| Placeholder | Source |
| --- | --- |
| `{{PROJECT_NAME}}` | `.agents/project.yaml` → `project.name` |
| `{{FRONTEND_STACK}}` | `.agents/project.yaml` → `project.frontend_stack` (fallback: pre-flight detection) |
| `{{BACKEND_STACK}}` | `.agents/project.yaml` → `project.backend_stack` |
| `{{DB_TYPE}}` | `.agents/project.yaml` → `project.db_type` |
| `{{WEB_URL}}`, `{{API_URL}}` | `.agents/project.yaml` → `environments[active_env]` |
| `{{environments.staging.*}}` | `.agents/project.yaml` → `environments.staging.*` |
| `{{environments.production.*}}` | `.agents/project.yaml` → `environments.production.*` |
| `<host>`, `<db>`, `<see secrets store>` | LITERAL placeholders. Do NOT substitute with real values from `.env`. The user fills these in inside the destination tool (Jira / Confluence / Notion / etc.) where access is gated. |

The skill NEVER writes real passwords into the artifact body during code generation. The user pastes them into the destination tool after publish — that step is access-gated by the destination's permission model.

---

## Why this is the source of truth

- Adding a new publisher = one new file in `publishers/` that wraps this body. No content duplication.
- Changing a section heading = one edit here. Propagates to every destination on the next re-run.
- Security audit lives ONCE in `security-rules.md` against this template — not N times per publisher.
- Idempotency snapshot tracks a hash of this rendered body (after `.agents/project.yaml` substitution but before passwords). Drift triggers a surgical patch.
```
