# Decision Questions (Q1–Q5)

> **Purpose**: One batched message to the user. Defaults documented. Tradeoffs explained briefly. Wait for answers before scaffolding.
>
> **When to read**: Phase 3 of `SKILL.md`. Skip Q3 / Q4 on a surgical-patch run (the route + redirect are locked by the existing page); ask Q1, Q2, Q5 again only if the snapshot shows their values changed.

---

## How to ask

Ask all questions in ONE message. Do not interleave them with explanations of unrelated work. Defaults are pre-filled — the user can answer "all defaults" to skip the interactive flow.

Format the message in the host language detected during pre-flight (default English). Use `AskUserQuestion` when available; otherwise plain text bullets.

### Skip rule on initial prompt (IMPORTANT)

If the user's initial message ALREADY answers one or more of Q1–Q5 (e.g. they wrote `"publish credentials as a Jira Epic in the UPEX project"` → Q1 = Jira Epic; `"visible copy in Spanish"` → Q5 = Spanish; `"page at /qa"` → Q3 = `/qa`), the skill MUST:

1. **Lock the pre-answered values** as decisions and record them in the snapshot. Do NOT re-ask.
2. **Build a one-paragraph confirm-or-override message** listing only the locked decisions, e.g. _"Locked from your message: Q1=Jira Epic (UPEX), Q3=/qa, Q5=Spanish. Still need to confirm: Q2=DB role policy [recommend qa_user read-only], Q4=redirect old route [recommend skip, no overlapping page detected]. Reply with overrides or 'go'."_
3. **Only ask Q's that were NOT pre-answered**. The batched ask becomes 0–5 questions depending on how much the user front-loaded.
4. If the user replies with overrides → apply them and proceed. If they reply "go" or "all defaults" → proceed with the defaults for the unanswered Q's.

The skill MUST NOT ignore pre-answered values and re-ask the whole batch — that wastes a round-trip and signals the skill is not reading the user's intent.

How to detect pre-answers:

| User's wording                                                                       | Resolves Q |
| ------------------------------------------------------------------------------------ | ---------- |
| "Jira Epic", "Confluence page", "Notion", "manual paste", or names another publisher | Q1         |
| "read-only role", "qa_user", "no writes", or refusal of admin/superuser              | Q2         |
| "/qa", "/qa/testing", "/internal/qa", any explicit route                             | Q3         |
| "redirect from /guide", "replace /docs", or "no redirect needed"                     | Q4         |
| "Spanish", "English", "en español", "in English", `lang="es"` in the host app        | Q5         |

---

## Q1 — Credentials destination

Where will the real testing credentials live? The skill produces a single markdown body and routes it to the chosen destination.

| Option                   | When to pick                                                                                                                        | Tool used                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Jira Epic** (default)  | Team already runs Jira. Snippets render with a native copy button via `{noformat}`.                                                 | `/acli`                                                                                             |
| Confluence page          | Team uses Confluence. Better for embedded screenshots + restricted view groups.                                                     | `/acli` (Confluence) or Atlassian MCP                                                               |
| Notion page              | Team lives in Notion. Code blocks render copy buttons.                                                                              | Notion MCP if installed, otherwise manual paste                                                     |
| Other MCP-reachable tool | Team uses something else and an MCP is already configured (e.g. `Linear`, `Jira Server`, `1Password Connect`, an internal wiki MCP) | the detected MCP — `publishers/generic-mcp.md`                                                      |
| Other CLI-reachable tool | A CLI exists for the destination (e.g. `op` for 1Password, `bw` for Bitwarden, a custom internal tool)                              | the detected CLI — `publishers/generic-cli.md`                                                      |
| Manual paste             | None of the above is reachable                                                                                                      | the skill hands the user the rendered markdown + the destination URL — `publishers/manual-paste.md` |

**Recommendation**: Jira Epic if `/acli` is wired (it almost always is in this repo's boilerplate). The skill can switch later; the markdown body is portable.

---

## Q2 — DB role for testing

Which database role will the credentials artifact expose to testers?

| Option                                         | When to pick                                                                                                       | Risk                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **`qa_*` read-only role** (default)            | Tests can `SELECT` directly via DBHub MCP, but all writes go through the REST API which enforces tenant isolation. | None. Recommended.                                                                                            |
| Existing DML role scoped to specific tables    | Tests genuinely need direct writes (e.g. seed fixtures, bypass slow API).                                          | No row-level isolation — every tester sees every other tester's writes. Mention in the page.                  |
| Existing superuser / schema owner / `postgres` | Never. The skill REFUSES this option.                                                                              | Catastrophic. The skill stops and asks the user to provision a read-only role first. See `security-rules.md`. |

**Recommendation**: read-only. If no such role exists, the skill creates one (or asks the user to via Supabase / `psql` instructions) before continuing.

---

## Q3 — Page route

Where does the page live in the host site map?

| Option              | When to pick                                                        |
| ------------------- | ------------------------------------------------------------------- |
| **`/qa`** (default) | Public, short, memorable.                                           |
| `/qa/testing`       | Site already has a `/qa` index that hosts other QA-related content. |
| `/dev/qa`           | Site reserves `/dev/*` for internal-only routes.                    |
| `/internal/qa`      | Site has an `/internal/*` namespace gated by SSO.                   |

**Recommendation**: `/qa` unless the host IA collides with it. Match the host's existing patterns — the pre-flight check surfaces them.

---

## Q4 — Redirect old route?

The pre-flight detected one of `/guide`, `/docs`, `/onboarding`, `/integration` already exists with overlapping scope.

| Option                                | When to pick                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Yes** (default if a sibling exists) | The old page is stale. Replace its content with a redirect to `/qa`. Keep the old route name reachable for one release cycle. |
| No                                    | Old page has independent scope and stays. `/qa` is added alongside, no redirect.                                              |
| Skip (no sibling exists)              | Pre-flight found no overlapping page. Q4 is skipped.                                                                          |

**Recommendation**: yes if a sibling exists. Server-side redirect when the framework supports it (`next.config.redirects()`, Remix `loader` returning `redirect(/qa, 301)`, etc.) — faster, no client-side flash. Client-side `useEffect(router.replace)` only as a fallback. See `routing-patterns.md`.

---

## Q5 — Visible-copy language

What language should the page's visible copy use? Code identifiers + `data-testid`s remain English regardless.

| Option                                    | When to pick                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **English** (default when no host signal) | Stack default. Neutral. Most QA tooling docs are in English.                                                                                            |
| Spanish                                   | The host app's other pages are in Spanish (pre-flight detected `<html lang="es">` or Spanish copy).                                                     |
| Mirror host language                      | Auto — the skill uses whatever the host app exposes. Pick this when the host app has clear language config (`next-intl`, `react-i18next`, root `lang`). |
| Other                                     | The host app is in a language the skill should mirror. User specifies.                                                                                  |

**Recommendation**: mirror host language when the host has a clear signal; otherwise English. The skill defaults to English in tests and fresh repos.

---

## Skip rules on re-run

On a surgical-patch run (idempotency detected drift), only ask the questions whose snapshot values changed. Example: if only `auth=` and `db=` changed, do not re-ask Q1 / Q3 / Q4 — re-use the cached answers stored in the snapshot comment.

If the user wants to **override** a cached answer mid-run, they can interrupt — the skill respects the latest user instruction over the cached snapshot.
