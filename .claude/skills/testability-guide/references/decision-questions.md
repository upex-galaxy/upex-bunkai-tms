# Decision Questions (Q1–Q8)

> **Purpose**: One batched message to the user. Defaults documented. Tradeoffs explained briefly. Wait for answers before scaffolding.
>
> **When to read**: Phase 3 of `SKILL.md`. Skip Q3 / Q4 on a surgical-patch run (the route + redirect are locked by the existing page); ask Q1, Q2, Q5 again only if the snapshot shows their values changed.
>
> **Page-craft questions (Q6–Q8)** are detection-pre-answered: the skill detects the right default from the repo and only asks if detection is ambiguous. They control how good the page LOOKS + reads — syntax highlighting, the agentic UI driver, and the request viewer.

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
| "syntax highlighting", "Shiki", "no highlighter", "plain pre", "highlight the code"   | Q6         |
| "playwright-cli", "Playwright MCP", "@playwright/mcp", "agentic browser driver"       | Q7         |
| "Postman-style", "request cards", "plain curl blocks", "request viewer"               | Q8         |

---

## Q1 — Credentials destination

Where will the real testing credentials live? The skill produces a single markdown body and routes it to the chosen destination.

| Option                   | When to pick                                                                                                                        | Tool used                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Jira Epic** (default)  | Team already runs Jira. Snippets render with a native copy button (ADF code blocks via `md-to-adf.ts`).                                                 | `/acli`                                                                                             |
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

## Q6 — Syntax highlighting

How should the page's code blocks be rendered? Every QA snippet (curl, MCP config per agent, Playwright fixtures, `dbhub.toml`) is more readable with real syntax colors.

| Option                                  | When to pick                                                                                                  | Cost                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Server-side highlighter** (default)   | The host has no highlighter yet. Adds ONE server-only dependency (Shiki, or the host's chosen equivalent). | **+1 dep**, but **zero client JS** — highlighting runs at build/request time and ships static HTML strings. |
| Reuse the host's existing highlighter   | The host already ships a highlighter (Shiki, Prism, highlight.js, `rehype-pretty-code`, a Code component).    | None — adapt the golden's pipeline onto the existing one.                                                  |
| Plain `<pre>` (no highlighter)          | The host forbids any new dep AND has none, or the page must stay byte-minimal.                                | None, but the page reads worse — monochrome code walls.                                                    |

**Pre-answer (detection)**: in Phase 1, grep `package.json` for a highlighter (`shiki`, `prismjs`, `react-syntax-highlighter`, `highlight.js`, `rehype-pretty-code`, `@shikijs/*`). If one exists → reuse it (no question). If none → default to **Shiki, server-only** (it is the single dependency this skill is allowed to add — see `SKILL.md` Notes) and proceed; only ask if the host has an explicit "no new deps" policy detected (e.g. a `renovate`/CI gate or an CLAUDE.md rule).

**Recommendation**: Shiki when the host has none. It is server-only (runs in a React Server Component / build step), emits dual-theme CSS-variable HTML for dark/light, and adds zero client-side JavaScript. The highlight pipeline is in `page-craft.md` ("Server highlight pipeline").

---

## Q7 — Agentic UI driver

How does an AI agent drive the browser for the page's §6(b) "agentic" examples?

| Option                              | When to pick                                                                                            | Tradeoff                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **`playwright-cli` binary** (default) | A `playwright-cli` skill is installed and/or the team drives the browser by direct CLI commands.        | Fewer tokens, direct commands (`open` / `snapshot` / `fill` / `click` / `screenshot` / `close`). |
| Playwright MCP (`@playwright/mcp`)  | The project already wires `@playwright/mcp` in `.mcp.json` and the team prefers the MCP tool surface.   | Heavier token cost; richer caps flags. Keep as the explicit fallback line.                        |

**Pre-answer (detection)**: in Phase 1, check `.mcp.json` (+ `opencode.jsonc` / `codex.toml` / `.gemini/settings.json`) for a `playwright` MCP entry, AND check whether a `/playwright-cli` skill is present in the session skill list / registry. If a `playwright-cli` skill exists → default **playwright-cli**. If `@playwright/mcp` is wired and no CLI skill → default **Playwright MCP**. If both exist → default **playwright-cli** (cheaper) and mention the MCP as fallback. Only ask if neither is detectable.

**Recommendation**: `playwright-cli` when its skill is available — it is the cheaper, direct-command path and the §6(b) cookbook + ArchDiagram UI badge ("playwright-cli → UI") assume it. The command cookbook is in `mcp-and-env-setup.md` §6.

---

## Q8 — Request viewer

How should §5's API auth requests be presented?

| Option                                       | When to pick                                                                                           | Tradeoff                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Postman-style request cards** (default)    | The page documents 2+ auth requests / endpoints a tester will exercise.                                | Richer: METHOD badge, URL+copy, Headers table, Body/Response panels, Visual/curl toggle. |
| Plain curl blocks                            | Only one trivial auth call exists, or the host kit cannot render tabs/tables cheaply.                  | Simpler — a single highlighted curl block per method. Keep as the fallback.          |

**Pre-answer (detection)**: default to **request cards** whenever the detected auth surface has ≥1 structured request to render (almost always). Fall back to plain curl blocks only when the host UI kit cannot scaffold the needed primitives (tabs/table) AND adding them is disallowed. No question unless that fallback condition is hit.

**Recommendation**: request cards. They REPLACE the old curl-wall `AuthMethods` as the §5 default (`page-craft.md` "Request viewer"). The card model is detection-driven — the skill reads the project's REAL auth requests into the `ApiRequest[]` model; it never bakes in signup/signin/token endpoints.

---

## Skip rules on re-run

On a surgical-patch run (idempotency detected drift), only ask the questions whose snapshot values changed. Example: if only `auth=` and `db=` changed, do not re-ask Q1 / Q3 / Q4 — re-use the cached answers stored in the snapshot comment.

Q6–Q8 are recorded in the snapshot `page-features=` field (see `idempotency-snapshot.md`). On re-run, re-use the cached page-craft choices unless the user asks to upgrade an older flat page — then offer the detected defaults (e.g. add `shiki`, switch to `request-cards`, swap Playwright MCP → `playwright-cli`).

If the user wants to **override** a cached answer mid-run, they can interrupt — the skill respects the latest user instruction over the cached snapshot.
