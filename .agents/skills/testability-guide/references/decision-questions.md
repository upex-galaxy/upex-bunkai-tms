# Decision questions (Q1 to Q8)

> This file holds the questions Phase 3 of `SKILL.md` puts to the user in one batched message, with the default, the tradeoff and the unattended path for each. Scaffold only after the answers land.
>
> On a surgical-patch run the existing page already locks the route and the redirect, so skip Q3 and Q4. Ask Q1, Q2 and Q5 again only if the snapshot shows their values changed.
>
> Q6 to Q8 shape how good the page looks and reads: syntax highlighting, the agentic UI driver and the request viewer. Detection answers them from the repo, and the skill asks only when detection is ambiguous.

---

## How to ask

Ask all questions in one message, apart from any explanation of unrelated work. The defaults are pre-filled, so the user can answer "all defaults" and skip the interactive flow. Write the message in the user's working language (AGENTS.md Critical Rule #12). Use `AskUserQuestion` when it is available, and plain text bullets otherwise.

### With nobody at the keyboard

A worker, a routine or a subagent never waits on these questions. Who decides follows `agentic-dev-core/references/decision-protocol.md`: search the record first (the brief, the snapshot, `.agents/project.yaml`, ADRs), follow what is settled, decide the technical rest with its default, and escalate only what the protocol reserves. A supervised worker passes the batch to its conductor, which holds the gate. In a routine, the delegating brief is the approval source when it covers the question. Each question below ends with its unattended path. Every default taken without an answer goes in the run's report as a `DECIDED:` line naming the option it beat, and in the snapshot.

### Pre-answered questions

When the user's first message already answers one or more of Q1 to Q5, for example "publish credentials as a Jira Epic in the UPEX project", "visible copy in Spanish" or "page at /qa", the skill:

1. Locks the pre-answered values as decisions and records them in the snapshot, without re-asking.
2. Sends one short confirm-or-override message that lists only the locked decisions. For example: _"Locked from your message: Q1=Jira Epic (UPEX), Q3=/qa, Q5=Spanish. Still need to confirm: Q2=DB role policy [recommend qa_user read-only], Q4=redirect old route [recommend skip, no overlapping page detected]. Reply with overrides or 'go'."_
3. Asks only the questions that were not pre-answered, so the batch holds between 0 and 5 questions depending on how much the user front-loaded.
4. Applies the overrides if the user sends any, and proceeds with the defaults for the unanswered questions on "go" or "all defaults".

Re-asking the whole batch wastes a round trip and shows the skill did not read the request.

How to recognise a pre-answer:

| User's wording                                                                       | Resolves Q |
| ------------------------------------------------------------------------------------ | ---------- |
| "Jira Epic", "Confluence page", "Notion", "manual paste", or names another publisher | Q1         |
| "read-only role", "qa_user", "no writes", or refusal of admin/superuser              | Q2         |
| "/qa", "/qa/testing", "/internal/qa", any explicit route                             | Q3         |
| "redirect from /guide", "replace /docs", or "no redirect needed"                     | Q4         |
| "Spanish", "English", "en español", "in English", `lang="es"` in the host app        | Q5         |
| "syntax highlighting", "Shiki", "no highlighter", "plain pre", "highlight the code"  | Q6         |
| "playwright-cli", "Playwright MCP", "@playwright/mcp", "agentic browser driver"      | Q7         |
| "Postman-style", "request cards", "plain curl blocks", "request viewer"              | Q8         |

---

## Q1: Credentials destination

Where will the real testing credentials live? The skill produces one markdown body and routes it to the chosen destination.

| Option                   | When to pick                                                                                                                        | Tool used                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Jira Epic** (default)  | The team already runs Jira. Snippets render with a native copy button (ADF code blocks via `md-to-adf.ts`).                         | `/acli`                                                                                             |
| Confluence page          | The team uses Confluence. Better for embedded screenshots and restricted view groups.                                               | `/acli` (Confluence) or Atlassian MCP                                                               |
| Notion page              | The team lives in Notion. Code blocks render copy buttons.                                                                          | Notion MCP if installed, otherwise manual paste                                                     |
| Other MCP-reachable tool | The team uses something else and an MCP is already configured (for example `Linear`, `Jira Server`, `1Password Connect`, an internal wiki MCP) | the detected MCP, via `publishers/generic-mcp.md`                                          |
| Other CLI-reachable tool | A CLI exists for the destination (for example `op` for 1Password, `bw` for Bitwarden, a custom internal tool)                       | the detected CLI, via `publishers/generic-cli.md`                                                   |
| Manual paste             | None of the above is reachable                                                                                                      | the skill hands the user the rendered markdown and the destination URL, via `publishers/manual-paste.md` |

Recommendation: Jira Epic if `/acli` is wired, which it almost always is in this boilerplate. The skill can switch later because the markdown body is portable.

Unattended: the brief's destination if it names one. Publishing is an outward write (a Jira, Confluence or Notion page), so without a brief that covers it the run renders the body to a local file, records the intended destination in the snapshot, and stops before the publish. It reports the stop and what is waiting.

---

## Q2: DB role for testing

Which database role will the credentials artifact expose to testers?

| Option                                         | When to pick                                                                                                       | Risk                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **`qa_*` read-only role** (default)            | Tests can `SELECT` directly through the DB MCP that `mcp-and-env-setup.md` §4.0 resolves (DBHub by default), and every write goes through the REST API, which enforces tenant isolation. | None. Recommended. |
| Existing DML role scoped to specific tables    | Tests genuinely need direct writes (for example seed fixtures, or bypassing a slow API).                           | No row-level isolation: every tester sees every other tester's writes. Say so on the page.                    |
| Existing superuser / schema owner / `postgres` | Never. The skill refuses this option.                                                                              | Catastrophic. The skill stops and asks the user to provision a read-only role first. See `security-rules.md`. |

Recommendation: read-only. If no such role exists, the skill stops, asks the user to provision one, and hands over the SQL plus the route `db-change-doctrine.md` assigns by `stack.database.migrations_tool` (`security-rules.md` Hard refusals 1). It never creates the role itself.

Unattended: take the read-only role. If none exists, the role is a database change the run does not make: the run hands over the SQL, stops before the credentials artifact and reports. The superuser option is refused whoever is watching.

---

## Q3: Page route

Where does the page live in the host site map?

| Option              | When to pick                                                        |
| ------------------- | ------------------------------------------------------------------- |
| **`/qa`** (default) | Public, short, memorable.                                           |
| `/qa/testing`       | The site already has a `/qa` index that hosts other QA-related content. |
| `/dev/qa`           | The site reserves `/dev/*` for internal-only routes.                |
| `/internal/qa`      | The site has an `/internal/*` namespace gated by SSO.               |

Recommendation: `/qa` unless the host information architecture collides with it. Match the host's existing patterns, which the pre-flight check surfaces.

Unattended: take `/qa`, or the host-matching route when the pre-flight shows a collision. The choice is reversible in the pull request, so report it as `DECIDED:`.

---

## Q4: Redirect the old route?

Pre-flight found that one of `/guide`, `/docs`, `/onboarding` or `/integration` already exists with overlapping scope.

| Option                                | When to pick                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Yes** (default if a sibling exists) | The old page is stale. Replace its content with a redirect to `/qa`, and keep the old route name reachable for one release cycle. |
| No                                    | The old page has independent scope and stays. `/qa` is added alongside, with no redirect.                                     |
| Skip (no sibling exists)              | Pre-flight found no overlapping page, so Q4 is skipped.                                                                       |

Recommendation: yes if a sibling exists. Use a server-side redirect when the framework supports one (`next.config.redirects()`, a Remix `loader` returning `redirect(/qa, 301)`, and so on): it is faster and has no client-side flash. Use client-side `useEffect(router.replace)` only as a fallback. See `routing-patterns.md`.

Unattended: take the default (redirect when a sibling exists, skip otherwise). The change lands in a pull request, so it is reversible. Report it as `DECIDED:`.

---

## Q5: Visible-copy language

What language should the page's visible copy use? Code identifiers and `data-testid`s stay English whatever the answer.

| Option               | When to pick                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English              | The host app's other pages are in English, or the user picks it.                                                                                         |
| Spanish              | The host app's other pages are in Spanish (pre-flight detected `<html lang="es">` or Spanish copy).                                                      |
| Mirror host language | The skill uses whatever the host app exposes. Pick it when the host has a clear language config (`next-intl`, `react-i18next`, a root `lang`).           |
| Other                | The host app is in a language the skill should mirror. The user specifies it.                                                                            |

Recommendation: mirror the host language when the host has a clear signal. With no signal, ask: the skill assumes no default language.

Unattended: the brief's language, else the host signal. With neither, write English and report the assumption as `DECIDED:`, because visible copy is a one-line change to redo.

---

## Q6: Syntax highlighting

How should the page's code blocks be rendered? Every QA snippet (curl, MCP config per agent, Playwright fixtures, `dbhub.toml`) reads better with real syntax colors.

| Option                                | When to pick                                                                                                 | Cost                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Server-side highlighter** (default) | The host has no highlighter yet. Adds one server-only dependency (Shiki, or the host's chosen equivalent).   | One dependency, but no client JS: highlighting runs at build or request time and ships static HTML strings. |
| Reuse the host's existing highlighter | The host already ships a highlighter (Shiki, Prism, highlight.js, `rehype-pretty-code`, a Code component).   | None. Adapt the golden's pipeline onto the existing one.                                                    |
| Plain `<pre>` (no highlighter)        | The host forbids any new dependency and has none, or the page must stay byte-minimal.                        | None, but the page reads worse: monochrome code walls.                                                      |

Pre-answer (detection): in Phase 1, grep `package.json` for a highlighter (`shiki`, `prismjs`, `react-syntax-highlighter`, `highlight.js`, `rehype-pretty-code`, `@shikijs/*`). If one exists, reuse it and ask nothing. If none exists, default to Shiki, server-only (the one dependency this skill may add, see the Notes in `SKILL.md`) and proceed. Ask only when the host has an explicit "no new deps" policy, such as a `renovate` or CI gate or an AGENTS.md rule.

Recommendation: Shiki when the host has none. It runs server-only (in a React Server Component or a build step), emits dual-theme CSS-variable HTML for dark and light, and adds no client JavaScript. The highlight pipeline is in `page-craft.md` ("Server highlight pipeline").

Unattended: detection decides. An ambiguous "no new deps" policy resolves to plain `<pre>`, the option that adds nothing, reported as `DECIDED:`.

---

## Q7: Agentic UI driver

How does an AI agent drive the browser for the page's §6(b) "agentic" examples?

| Option                                | When to pick                                                                                          | Tradeoff                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **`playwright-cli` binary** (default) | A `playwright-cli` skill is installed, or the team drives the browser with direct CLI commands.       | Fewer tokens and direct commands (`open` / `snapshot` / `fill` / `click` / `screenshot` / `close`). |
| Playwright MCP (`@playwright/mcp`)    | The project already wires `@playwright/mcp` in `.mcp.json` and the team prefers the MCP tool surface. | Heavier token cost, richer caps flags. Keep it as the explicit fallback line.                    |

Pre-answer (detection): in Phase 1, check `.mcp.json` (plus `opencode.jsonc`, `codex.toml` and `.gemini/settings.json`) for a `playwright` MCP entry, and check whether a `/playwright-cli` skill is in the session skill list or the registry. A `playwright-cli` skill means the default is `playwright-cli`. `@playwright/mcp` wired with no CLI skill means Playwright MCP. Both present means `playwright-cli` (cheaper), with the MCP mentioned as the fallback. Ask only when neither is detectable.

Recommendation: `playwright-cli` when its skill is available. It is the cheaper, direct-command path, and the §6(b) cookbook and the ArchDiagram UI badge ("playwright-cli → UI") assume it. The command cookbook is in `mcp-and-env-setup.md` §6.

Unattended: detection decides; with neither signal, take `playwright-cli` and report it as `DECIDED:`.

---

## Q8: Request viewer

How should §5's API auth requests be presented?

| Option                                    | When to pick                                                                           | Tradeoff                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Postman-style request cards** (default) | The page documents two or more auth requests or endpoints a tester will exercise.      | Richer: METHOD badge, URL with copy, Headers table, Body and Response panels, Visual/curl toggle. |
| Plain curl blocks                         | Only one trivial auth call exists, or the host kit cannot render tabs and tables cheaply. | Simpler: one highlighted curl block per method. Keep it as the fallback.              |

Pre-answer (detection): default to request cards whenever the detected auth surface has at least one structured request to render, which is almost always. Fall back to plain curl blocks only when the host UI kit cannot scaffold the needed primitives (tabs, table) and adding them is disallowed. Ask only when that fallback condition is hit.

Recommendation: request cards. They replace the old curl-wall `AuthMethods` as the §5 default (`page-craft.md` "Request viewer"). The card model is detection-driven: the skill reads the project's real auth requests into the `ApiRequest[]` model and never bakes in signup, signin or token endpoints.

Unattended: detection decides, and the fallback condition is the only reason to leave request cards.

---

## Skip rules on re-run

On a surgical-patch run (idempotency detected drift), ask only the questions whose snapshot values changed. If only `auth=` and `db=` changed, do not re-ask Q1, Q3 or Q4. Reuse the cached answers stored in the snapshot comment.

Q6 to Q8 are recorded in the snapshot `page-features=` field (see `idempotency-snapshot.md`). On a re-run, reuse the cached page-craft choices unless the user asks to upgrade an older flat page. Then offer the detected defaults (for example add `shiki`, switch to `request-cards`, swap Playwright MCP for `playwright-cli`).

A user who wants to override a cached answer mid-run can interrupt, and the skill follows the latest user instruction over the cached snapshot.
