# User Personas — Bunkai

> Source: `executive-summary.md`, `business-model.md`. Four personas — three human, one non-human (AI agent operator) because the API surface makes it a first-class consumer.

---

## Persona 1 — Elena Vargas, Senior QA Engineer (Quality Engineer)

**Photo description (for AI image generation)**: woman, late 30s, casually dressed in a hoodie or simple sweater, sitting at a multi-monitor desk in a warm dimly-lit home office, two screens visible — one with a code editor, one with a Jira board — coffee mug nearby, posture focused, headphones around her neck.

### Demographics

- **Age**: 36
- **Occupation**: Senior QA Engineer / Quality Engineer at a mid-market SaaS company (~150 engineers)
- **Location**: Buenos Aires, Argentina (works fully remote for a US-based or European company)
- **Education**: Computer Science degree + 12+ years in software testing, ISTQB Advanced

### Goals

1. Cover the team's regression surface without burning weeks rewriting tests after every product change.
2. Make traceability between user stories, acceptance criteria, tests, and bugs **provable** to stakeholders, not aspirational.
3. Shift left — get tests written while the feature is still being designed, not after release.
4. Eventually delegate routine test execution to AI agents so she can focus on exploratory + edge-case work.

### Pain Points

1. **Duplication in Xray** — the `login` flow exists in 40 monolithic test cases; one URL change means 40 edits.
2. **Reports she does not trust** — "85% pass rate" tells her nothing about whether the failing 15% are critical paths.
3. **Bugs lost in translation** — bug filed in Jira loses the test/run context within a week; coverage of fixed bugs cannot be verified later.
4. **Tools that work against her** — every TMS she's used (Xray, Zephyr, TestRail) lets her do bad QA fast. She wants a tool that helps her do good QA fast.

### Tech Savviness

- **Early adopter** within the QA-engineering audience. Reads dev tools blogs (Linear, Vercel, Supabase), follows QA Twitter/Mastodon.
- Lives in **VS Code** and a Chromium browser. Comfortable with `git`, basic SQL, JavaScript, YAML, Bash.
- Writes Playwright + Cypress tests. Uses Claude / ChatGPT regularly to draft test scaffolding.
- Power-user of keyboard shortcuts, command palettes.

### Quote

> _"No me molesta escribir tests. Me molesta tener que reescribirlos cada release porque el TMS no entiende que el login es un ATC, no un párrafo copiado 40 veces."_

---

## Persona 2 — Mateo Silva, QA Lead / Quality Engineering Manager

**Photo description**: man, mid 40s, business-casual shirt, glasses, sitting in a small meeting room with a whiteboard behind him showing a Gantt chart, laptop open showing a dashboard with green/red/yellow bars, calm but slightly tired expression.

### Demographics

- **Age**: 44
- **Occupation**: QA Lead / Quality Engineering Manager at a regulated-industry company (fintech, healthtech, or insurance)
- **Location**: Madrid, Spain (hybrid, in-office 2 days/week)
- **Education**: Industrial Engineering + 18 years in QA, transitioned to management 5 years ago

### Goals

1. Answer "what does this sprint actually cover?" in under one minute, with data, when product/eng managers ask.
2. Reduce the team's manual-execution headcount cost by formalizing what's automatable and migrating it gradually.
3. Build a coverage story credible to legal/compliance and to leadership.
4. Move the team from "test cases in a spreadsheet" to a real engineering practice — without forcing a tool migration that takes 6 months.

### Pain Points

1. **No coverage answer he believes** — Xray reports look like data but rely on labels nobody maintains.
2. **Hard to onboard new QAs** — current TMS has no opinion, so each new person invents their own structure.
3. **Audit anxiety** — when compliance asks "show me the evidence trail from user story to test execution to bug fix", he assembles it manually.
4. **Vendor lock-in** — Xray pricing keeps going up; he wants leverage but migration sounds painful.

### Tech Savviness

- **Mainstream** technical level. Reads dashboards more than he writes code these days. Comfortable in Jira, Confluence, Excel, basic SQL.
- Reviews automation reports without writing the automation himself.
- Skeptical of "AI magic" but pragmatic — will adopt anything that demonstrably reduces report-prep time.

### Quote

> _"Necesito una herramienta que cuando llegue auditoría me dé la trazabilidad sin que yo tenga que armarla con post-its. Y que mi equipo no necesite tres meses para aprenderla."_

---

## Persona 3 — Sara Iglesias, Full-Stack Developer

**Photo description**: woman, late 20s, jeans + t-shirt, at a standing desk in a bright open-plan office, two monitors showing a code editor and a GitHub PR view, headphones on, focused.

### Demographics

- **Age**: 29
- **Occupation**: Full-Stack Developer at a 60-person SaaS startup
- **Location**: Lisbon, Portugal (in-office mostly)
- **Education**: Self-taught + bootcamp, 5 years experience

### Goals

1. Ship features and know they are tested without becoming a full QA.
2. See "is my feature covered?" in the same flow where she reads PR feedback — not in a separate tool she has to remember to check.
3. Link bug reports back to PRs and commits so the post-mortem is honest.

### Pain Points

1. **Context-switching tax** — Jira tab, Xray tab, GitHub tab, console logs, Slack, repeat.
2. **QA gives me a bug with no repro context** — Bunkai promises bugs that arrive with the ATC and run state attached.
3. **She doesn't speak "test case"** — she speaks acceptance criteria + Gherkin / examples. A tool that maps her language to the QA's language helps.

### Tech Savviness

- **Early adopter** in development tools, **mainstream** in QA tools (uses what the QA team uses; not opinionated).
- Lives in VS Code, GitHub, Linear/Jira, Slack. Familiar with Markdown, OpenAPI, Postman, basic SQL.
- Uses Claude Code in her editor.

### Quote

> _"Si me pueden decir desde la PR si lo que cambié rompe un ATC, dejo de pedirle a QA que me explique qué se rompió."_

---

## Persona 4 — "Karim", Autonomous AI Test Agent (non-human)

**Description**: not a person; an AI agent (e.g. Claude Code, a Playwright-driven script, or a bespoke quality-engineering agent) acting on behalf of Elena, Mateo, or the CI/CD pipeline. Documented here because **the API surface of Bunkai treats this consumer as first-class**, and design decisions (auth model, idempotency, rate limits, response shape) are made with this consumer in mind.

### Goals

1. Receive a test to execute as a structured payload (ordered ATCs, expected assertions, target environment URL/credentials).
2. Drive the application under test (UI via Playwright, API via HTTP) and report progress step-by-step to Bunkai.
3. Mark each step pass/fail/block in real time and attach evidence (screenshots, logs, network traces) to the run.
4. Open a bug when something fails, with full context auto-populated from the failing ATC + run state.

### Pain Points

1. **APIs that fight back** — APIs designed for humans (long polling, inconsistent shapes, hidden state) are hard to operate reliably.
2. **No write-back primitive** — many TMS APIs let you read tests but not stream step results back.
3. **No idempotency** — retrying a step due to a timeout doubles the run state.
4. **Auth complexity** — bespoke OAuth dances are friction.

### Tech expectations of Bunkai

- A clean OpenAPI 3.x spec at `/api/openapi.json` it can read at runtime.
- Bearer-token authentication (organization-scoped tokens, configurable scopes).
- A WebSocket or SSE channel for streaming step-by-step results in real time (Phase 2).
- Idempotency keys on POST endpoints.
- Predictable response shapes (`{ success, data, error }` envelope).
- Stable, semver-versioned API.

### Quote (canonical role expressed as if the agent could speak)

> _"Give me a deterministic API. I will give you a test runner."_

---

## Cross-persona notes

- All four personas need to **trust the data they see**. The structural-traceability guarantee of Bunkai (no ATC without US+AC, no bug without module) is the trust mechanism.
- Personas 1 and 2 are the buyers / champions of Bunkai (in Cloud and Enterprise tiers respectively). Persona 3 is the adoption multiplier (developers who appreciate the tool spread it across teams). Persona 4 is the long-tail differentiator — every new AI-driven workflow built on top of Bunkai's API increases switching cost away.
- Diversity intentional: Latin / European geographies, gender mix, mid-career levels — the QA-engineering audience is internationally distributed and not bay-area-skewed.
