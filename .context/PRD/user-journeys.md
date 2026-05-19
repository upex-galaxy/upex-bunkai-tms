# User Journeys — Bunkai (MVP)

> Three journeys cover the core MVP loop: (1) Setup + first ATC, (2) Manual run + bug capture, (3) AI agent driving a Run via API.

---

## Journey 1 — "First-time setup: from sign-up to first ATC"

### Persona

Elena Vargas (Senior QA Engineer) — first time opening `bunkai.io`.

### Scenario

Elena's team adopted Bunkai for a pilot. She has the credentials of a Workspace owner invite waiting in her email.

### Steps

**Step 1 — Sign in**
- *User action*: Clicks the invite email link, lands on the Sign-in screen, picks "Sign in with GitHub".
- *System response*: Completes OAuth, joins her to the Workspace, lands her on the Workspace Home.
- *Pain point*: If the OAuth callback fails (popup blocker, third-party-cookie restrictions), she may be stuck. Mitigation: fallback to magic-link email flow.

**Step 2 — Workspace Home orientation**
- *User action*: Reads the Workspace Home — sees four stat cards (Total ATCs, Active Runs, Open Bugs, Coverage %), her recent projects (empty for now), and a CTA "Create your first Project".
- *System response*: Cards show zeros and a friendly "let's set this up" call-out.
- *Pain point*: Without sample data, the dashboard feels barren. Mitigation: optional "Seed sample project" toggle on the empty-state CTA.

**Step 3 — Create Project**
- *User action*: Clicks "Create Project", names it "Checkout v2", picks the workspace, hits enter.
- *System response*: Project created; lands her in the Project View with the tree empty except a "+ New Module" hint.
- *Pain point*: She might assume Module hierarchy is folders, not entities. Mitigation: inline tooltip explaining "A Module is a first-class entity — ATCs and Bugs anchor to it; metrics are computed per Module."

**Step 4 — Build the Module tree**
- *User action*: Creates Modules: "Cart", "Payment", "Confirmation". Inside "Cart" adds sub-modules "Add to Cart", "Update Quantity".
- *System response*: Tree renders live with monospace IDs (`MOD-001`, ...). Status dots are grey (no tests yet).
- *Pain point*: She might over-nest. Mitigation: a soft warning at depth >4.

**Step 5 — Import a User Story (or write one)**
- *User action*: Inside "Add to Cart" module, opens the right panel, picks "Import from Jira" → searches "US-CHK-12 Add product to cart" → imports. AC field shows the 3 ACs pulled from the Jira description (parsed Markdown).
- *System response*: User Story stored, linked to the Jira issue with a backlink. AC list rendered as cards.
- *Pain point*: Jira parsing of AC blocks might misread non-Gherkin formats. Mitigation: editable AC cards post-import.

**Step 6 — Create first ATC**
- *User action*: Clicks "+ New ATC" on AC-01 ("Item appears in mini-cart after click"). Fills: title "Add valid product to cart from PLP", layer = UI, steps (5 ordered steps), assertions (3), tags.
- *System response*: Live preview pane renders the ATC as Markdown that an AI executor could read. Save persists; sidebar shows the new ATC node under the Module.
- *Pain point*: She forgets to set the layer. Mitigation: layer is mandatory; save button stays disabled with a tooltip.

**Step 7 — Realize this is workable**
- *User action*: Scrolls the tree, notices empty module dots, opens the command palette (Cmd+K) → "create ATC" → starts the next one without leaving the keyboard.
- *System response*: Command palette executes; new ATC form opens scoped to the same Module.

### Expected Outcome

Elena has set up her first project structure: Workspace → Project → Modules → US → AC → 1 ATC, in ~10 minutes, without consulting docs. She understands the tool's filosofía from the structure it forced her into.

### Alternative Paths / Edge Cases

- **GitHub OAuth blocked by IT proxy**: Bunkai surfaces the magic-link fallback within 30s.
- **Workspace invite expired**: Sign-in screen shows "Your invite has expired — ask {inviter_email} for a new one".
- **Jira credentials not configured**: "Import from Jira" button is hidden; replaced by "Add Workspace Integration" entry in Settings.
- **No Modules created yet**: Creating an ATC without a Module is blocked at the data layer — the form selects from existing Modules only.

---

## Journey 2 — "Manual execution: running a regression test + filing a bug"

### Persona

Elena Vargas, day 3 with Bunkai. The team has ~80 ATCs, 12 Tests, and she is running the smoke regression before a deploy.

### Scenario

The deploy window is in 30 minutes. Elena opens Bunkai to run TEST-008 (Checkout happy path).

### Steps

**Step 1 — Find the Test and start a Run**
- *User action*: Opens the Project, switches to Table View, filters tests tagged "smoke", clicks TEST-008.
- *System response*: Test detail opens with the chain of 7 ATCs and a "Start Run" button.
- *Pain point*: If filters did not persist from yesterday's session, she has to re-apply them. Mitigation: per-user persisted view state.

**Step 2 — Configure the Run**
- *User action*: Clicks "Start Run", picks target environment "staging.checkout.example.com" (from a dropdown of pre-configured environments), confirms executor = self.
- *System response*: Run created with status `running`, redirected to the focused Run screen.
- *Pain point*: Environment dropdown is empty on a fresh Project. Mitigation: "Add environment" CTA inside the dropdown.

**Step 3 — Walk through the ATCs**
- *User action*: For ATC-001 (Login), the runner shows 4 steps. She executes them in the staging app in a second browser tab, ticks pass on each. ATC-001 marked passing automatically when last step passes.
- *System response*: Status dot in the tree turns green, progress bar moves "1/7".
- *Pain point*: Tab-switching is constant. Mitigation: keyboard shortcuts (`P`/`F`/`B` for pass/fail/block + `Enter` for next step) keep hands on keyboard.

**Step 4 — Hit a failure on ATC-005 (Apply discount code)**
- *User action*: The discount field rejects a valid code. She marks step 3 of ATC-005 as fail. The "Report Bug" CTA highlights.
- *System response*: A side drawer slides in with a Bug form pre-filled: title placeholder "Failure on ATC-005 step 3", Module = "Payment" (inherited from ATC), Severity unset (required), Description empty, Steps-to-reproduce auto-populated with the 3 steps already executed.
- *Pain point*: Severity selection is friction. Mitigation: keyboard shortcuts 1–4 set severity directly.

**Step 5 — File the Bug**
- *User action*: Picks severity P2, edits title to "Valid promo codes rejected on /checkout/payment", saves.
- *System response*: Bug BUG-014 created, linked to Run #122, linked to ATC-005, linked to Module "Payment". If Jira sync configured, a Jira issue is created with backlinks. Drawer closes; runner moves to ATC-006.
- *Pain point*: She might want to abort the rest of the Run because the discount affects subsequent steps. Mitigation: "Abort Run" button always visible with a reason field.

**Step 6 — Abort the Run**
- *User action*: Clicks "Abort Run", picks reason "Blocking defect on dependent ATC".
- *System response*: Run status set to `aborted`. Coverage dashboard updates within 5s; the Test status reflects the new failure.

**Step 7 — Manager view**
- *User action*: Mateo (QA Lead) opens his Dashboard, sees the abort + new P2 Bug surfaced in the day's activity timeline.
- *System response*: Heatmap shows "Payment" Module's defect count incremented by 1.

### Expected Outcome

A reproducible Bug filed in ~90 seconds with full context (ATC, Run, Module, steps, evidence). The defect heatmap reflects the new state immediately. No copy-paste between tools.

### Alternative Paths / Edge Cases

- **Browser refresh during a Run**: Run state is server-persisted; refresh resumes from the same step.
- **Two QAs run the same test simultaneously**: Allowed; each creates a separate Run record. The Test's "last run" reflects the most recent.
- **Bug filing fails because Jira sync is down**: Bug is saved natively in Bunkai with status `pending_jira_sync`; a background job retries.
- **Network drop mid-Run**: Last-saved step is durable; user can resume on reconnect. Steps recorded since the last save (≤1 step) are replayed by the user.

---

## Journey 3 — "AI agent runs a Test via Bunkai API"

### Persona

Karim (AI Test Agent) — Elena configured a Playwright-driven Claude Code agent to run nightly regression of TEST-008 against staging.

### Scenario

A scheduled job kicks off at 02:00 UTC. The agent has a workspace-scoped Bearer token and knows the Test ID.

### Steps

**Step 1 — Authenticate**
- *Agent action*: `GET /api/v1/me` with `Authorization: Bearer <token>`.
- *System response*: 200 with token scopes confirmed.
- *Pain point*: Token expired. Mitigation: 401 response includes `code: TOKEN_EXPIRED` so the agent can fail loudly and notify Elena.

**Step 2 — Fetch the Test contract**
- *Agent action*: `GET /api/v1/tests/TEST-008?expand=atcs.steps,atcs.assertions`.
- *System response*: Full Test payload — ordered ATCs, each with steps + assertions + layer + env hints — in a single response.

**Step 3 — Start the Run**
- *Agent action*: `POST /api/v1/runs` with body `{ test_id: "TEST-008", environment: "staging", executor: { type: "agent", identity: "claude-code-nightly-v3" }, idempotency_key: "2026-05-19-nightly" }`.
- *System response*: 201 with `run_id: RUN-451`. Idempotency key recognized on retry — duplicate attempt returns the same `run_id`.

**Step 4 — Drive the application + report step-by-step**
- *Agent action*: For each step, agent executes via Playwright. After each step: `POST /api/v1/runs/RUN-451/steps/{step_id}/result` with `{ status: "pass", duration_ms: 410, evidence_url: "https://s3.../screenshot.png" }`.
- *System response*: Each POST returns 200; Bunkai updates run state. (Phase 2 — WebSocket / SSE channel will replace this polling-style stream with a push stream.)
- *Pain point*: Polling means the UI lags. Mitigation: MVP uses Supabase Realtime row-change subscription on the `run_steps` table to push UI updates to any user watching the Run.

**Step 5 — Handle a failure**
- *Agent action*: Step ATC-005 step 3 fails (assertion mismatch). Agent posts result `{ status: "fail", evidence_url, error_message }`. Then opens a Bug: `POST /api/v1/bugs` with `{ title, module_id, severity, atc_id, run_id, steps_to_reproduce, description }`.
- *System response*: Bug BUG-015 created, linked to the Run + ATC + Module identically to the manual flow.

**Step 6 — Close the Run**
- *Agent action*: `POST /api/v1/runs/RUN-451/finish` with `{ status: "failed", finished_at: <iso> }`.
- *System response*: Run finalized; metrics computed.

### Expected Outcome

A regression run executed and reported end-to-end by an AI agent with no human intervention. The resulting Run + Bug are indistinguishable in shape from a human-driven Run, so dashboards aggregate them transparently.

### Alternative Paths / Edge Cases

- **Idempotency-key collision** (agent retries with same key): API returns the original `run_id` instead of creating a duplicate.
- **Concurrent Run on same Test by a human**: Allowed; both Runs are separate records. The dashboard displays both in the Run history.
- **Agent abandons (process killed)**: Run remains in `running` status indefinitely until: (a) agent calls `/finish`, (b) a sweeper cron times it out after a configurable max_duration (default 4h).
- **Bug creation rate-limited**: API returns 429 with `Retry-After`; agent backs off.

---

## Cross-journey observations

- The same data model (Run + RunStep + Bug) serves both human and agent flows. This is **the** structural decision behind Bunkai's three-modes claim.
- Realtime UI updates are powered by Supabase Realtime on relevant tables in MVP. Phase 2 introduces a dedicated WebSocket + Redis pub/sub channel for the agentic protocol (lower latency, bidirectional, vendor-neutral).
- Every action that creates state goes through the API — there is no "UI-only" write path. This is the prerequisite for AI operators to ever drive the system without a humans-in-the-loop bottleneck.
