# Design brief — Bunkai TMS / bk-224-billing
Tool session: NEW project(s) — Open Design REST-driven (Mode A), one fresh project per screen
(daemon follow-up-run bug workaround, confirmed repeatable across earlier batches): project ids
`bunkai-bk-224-billing`, `-2`, `-3`, `-4`, `-5`, design system `user:bunkai` on every project.

## Mission
Design 5 screen(s) for Bunkai, a dark, dense, engineer-first test-management tool (register:
Linear / VS Code, not a consumer SaaS billing page). We describe WHAT each screen must accomplish;
HOW it looks is your call — layout, composition, hierarchy, component choices, and
micro-interactions are fully delegated to you. Your only hard boundary is the design contract:
never invent colors, fonts, or spacing values outside the attached `user:bunkai` design system.
When done, export and return the files as described in "Export & return".

## Product context
Bunkai Cloud is the hosted, paid tier of the product (self-hosted Community edition has no
billing surface). Workspace owners need to see their plan, seats, and usage at a glance, upgrade
or downgrade without a support ticket, and manage invoices. Plan-limit warnings appear anywhere in
the app a plan-limited resource (projects, seats, run-history retention) is created — not only
inside Settings.

## Frozen design contract (non-negotiable)
- Colors: surfaces `--bg-0..5` (#0a0b0d → #2d333c), text `--fg-0..4` (#f1f3f5 → #4a5057), strokes
  `rgba(255,255,255,.05/.08/.13/.22)`, accent (vermillion) `--accent #d9543f` / `-hi #e87060` /
  `-glow rgba(217,84,63,.18)` / `-soft rgba(217,84,63,.10)`, signal tokens pass `#2fb673` /
  fail `#e5484d` / blocked `#e8a838` / skipped `#8a91a0` / running `#4f8cf7` (each with a `-bg` at
  .08/.10) — use `--blocked`/`--fail`/`--pass` for warning/limit-reached/healthy usage-meter states.
- Typography: Inter for UI text, JetBrains Mono for money amounts, seat/usage counts, invoice IDs,
  and card-last-4 digits; Noto Serif JP only for the 分 brand mark.
- Radius: 3 / 5 / 7 / 10px (sharp, never above 10px). Spacing: 4px grid throughout.
- Component conventions: shadcn-style flat cards, 1px hairline borders, no glassmorphism, no
  gradients, no drop shadows beyond the frozen tokens, no emoji in UI copy.
- These tokens are attached to each Open Design project as the `user:bunkai` design system —
  reference them by their native token names; do not re-derive new values.

## Screens requested

### 1. billing-overview — Plan, seats & usage
- Route: `/settings/billing` — extends the Settings hub (§4.10; same shell as
  `bk-85-account-settings/settings-account.html`), "Billing" now LIVE in the settings nav
- Purpose: workspace owners/admins see the current plan, price, renewal, and usage against every
  plan-limited resource at a glance
- User stories: BK-229 — view workspace plan, seats, and usage
- The user must be able to: see the plan name, per-seat price, and next renewal date (paid plans
  only — a Free-plan workspace shows no renewal date or payment method, and an upgrade entry
  instead); see a seat meter as "N of limit seats" counting active members only (pending
  invitations never consume a seat); see one usage meter per plan-limited resource (projects, run
  history retention); recognize when a meter is approaching its cap (80%+) versus healthy, via a
  distinct visual state that is never color-alone; reach the upgrade flow from this screen when on
  Free
- States the ACs demand: paid-plan default (renewal date + payment summary visible); free-plan
  (no renewal/payment, upgrade CTA prominent); meter-approaching-limit (80%+, e.g. "9 of 10
  projects"); meter-healthy; loading; error
- Viewport: desktop-first 1440px

### 2. billing-details-invoices — Billing details & invoice history
- Route: `/settings/billing` (same page, lower section) — extends the Settings hub
- Purpose: the workspace owner manages the company billing profile and payment method, and
  downloads past invoices
- User stories: BK-231 — manage billing details and download invoices
- The user must be able to: view and edit the company billing profile (company name, billing
  email, address); view the active payment method (a card, shown only as a redacted reference —
  e.g. brand + last 4 digits, never a full card number) and replace it; browse an invoice history
  table (period, amount, status) and download any invoice as a PDF; when the most recent renewal
  charge failed, see it flagged clearly with the grace-period end date, and retry the charge once
  a new payment method is on file — this failed-renewal state is a persistent banner at the top of
  the Billing view, not a dismissible toast
- States the ACs demand: default (details + active card + invoice table); replace-payment-method
  in progress; failed-renewal banner with grace-period date and retry action; empty invoice
  history (workspace created this billing cycle, no invoices yet); loading; error
- Viewport: desktop-first 1440px
- Reuse the shell anatomy of `billing-overview.html` verbatim (same Settings hub, same page,
  this is the section directly below the plan/usage cards).
- Hard constraint: do NOT render a working credit-card entry form. Any payment-method visual uses
  an obviously non-functional placeholder (masked "**** **** **** 4242" style reference only,
  never a real-looking multi-field card form asking for a full number/CVC/expiry as live inputs).

### 3. plan-comparison-checkout — Upgrade flow (tier compare + checkout)
- Route: `/settings/billing/upgrade` — reached via the upgrade CTA on `billing-overview.html`
- Purpose: an owner compares the Free / Team / Enterprise tiers and completes a self-serve
  upgrade to Team; an admin can view but not purchase; Enterprise is a contact path, never a
  checkout
- User stories: BK-230 — upgrade to a paid plan
- The user must be able to: see the three tiers side by side, each showing its limits (seats,
  projects, run-history retention) and its price model, with the current plan clearly marked;
  choose Team, set a seat quantity, and complete a single confirm action; see a declined payment
  leave the workspace untouched (still Free, nothing charged), with a clear inline error and the
  ability to retry a different payment method without re-choosing the plan; on success, know
  immediately that limits are unlocked and that a purchase receipt is on its way; on the
  Enterprise column, get a contact path instead of any payment fields; as an admin (not owner),
  see the same comparison but with the confirm action structurally replaced by a note naming the
  workspace owner as the one who completes upgrades
- States the ACs demand: tier-comparison default; checkout-in-progress (seat quantity + payment
  entry); payment-declined (inline error, retry, plan choice preserved); success (returns to a
  billing-overview state with the new plan); Enterprise contact-path; admin view-only
- Viewport: desktop-first 1440px
- Reuse the shell anatomy of `billing-overview.html` — same Settings hub, same card language for
  the tier columns and the plan summary.
- Hard constraint: same as screen 2 — no working payment-collection form. The payment step is a
  clearly non-functional placeholder (obvious dummy fields or a "**** 4242" placeholder card, not
  a realistic checkout form).

### 4. billing-downgrade-cancel — Downgrade & cancel flow
- Route: `/settings/billing` (dialog/flow anchored to the plan card) — extends the Settings hub
- Purpose: the workspace owner downgrades to a lower tier or cancels the subscription, always
  seeing the consequences before confirming, and can resubscribe during the grace window
- User stories: BK-233 — downgrade or cancel the subscription
- The user must be able to: start a downgrade from a secondary (non-prominent) action on the plan
  card; before confirming, see exactly which resources would become read-only under the target
  plan's limits (e.g. "2 of 12 projects"), with an explicit statement that nothing is deleted;
  confirm the downgrade and immediately see the workspace on the new plan with the affected
  resources marked read-only (still fully viewable); alternatively, cancel the subscription as a
  quiet tertiary action and see the plan card reflect a pending cancellation with the exact
  end-of-period date; resubscribe from that same banner before the period ends and see the
  cancellation reverted with no new charge; as an admin (not owner), see the plan state but never
  see downgrade/cancel actions offered
- States the ACs demand: consequence-preview dialog (target-plan limits vs current usage, named
  affected resources, "nothing deleted" note); downgraded-with-read-only-resources; pending-
  cancellation banner (end date + resubscribe); admin view (no destructive actions offered);
  loading; error
- Viewport: desktop-first 1440px
- Reuse the shell anatomy of `billing-overview.html` — same Settings hub, same plan card this
  flow extends.
- Hard constraint: the consequence-preview dialog and the cancel confirmation both name the exact
  object (workspace name, resource count) being changed — no generic "are you sure?" copy.

### 5. plan-limit-warning — Cross-app plan-limit warning patterns
- Route: cross-app reusable component — render this file as a demonstration inside the Explorer /
  project-creation surface (the App Shell: 48px icon rail + full-width content, NOT the Settings
  hub's narrower rail+settings-nav layout), since project creation is the first consumer of this
  pattern per the story
- Purpose: two shared patterns (an approaching-limit banner, a limit-reached paywall modal) that
  will be reused anywhere a plan-limited resource is created across the app
- User stories: BK-232 — see plan-limit warnings with an upgrade path
- The user must be able to: keep working uninterrupted when approaching a limit (80%+) — see a
  dismissible, non-blocking warning banner naming the limit, with the triggering action (e.g.
  creating the 9th of 10 projects) still succeeding; when a limit is fully reached (100%), have
  the blocking action stopped by a centered modal that names the limit and states "10 of 10 used";
  as the workspace owner, get a direct action in that modal routing to the upgrade flow; as a
  member/viewer (non-owner), see the same block but instead of a checkout, see the workspace
  owner's name as the person who can upgrade — never offered a checkout themselves; after the
  owner upgrades, have a previously blocked action succeed on retry within the same session, no
  reload or re-authentication needed
- States the ACs demand: approaching-limit banner (dismissible, non-blocking); limit-reached modal
  — owner variant (direct "Upgrade plan" CTA); limit-reached modal — member/viewer variant (names
  the owner, no checkout offered)
- Viewport: desktop-first 1440px
- This screen does NOT reuse `billing-overview.html`'s Settings-hub layout — it lives in the main
  App Shell. Reuse only the 48px icon rail chrome (logo mark, nav icons, avatar) already
  established across the product's other App-Shell screens; the rest of the surface (an Explorer/
  project-creation context) is your call, since it exists only to host the banner/modal patterns
  being demonstrated.

## Hard constraints
- Name each screen file exactly `{screen-slug}.html` from the list above — the repo maps files by
  slug.
- No new tokens. A value not in the frozen contract is a defect, not a creative choice.
- Self-contained HTML per screen (inline CSS, no external assets/CDN), target viewport 1440px.
- `:focus-visible` gets a 1px `--accent` outline with 1px offset on every interactive element;
  full keyboard paths for every flow (upgrade, downgrade, cancel, dismiss warning).
- Color is never the sole signal (usage-meter states, plan states, role-gated actions all pair
  color with text/icon/shape).
- WCAG AA contrast throughout.
- Destructive or irreversible billing actions (cancel plan, confirm downgrade) confirm naming the
  exact object (workspace name, plan, affected resource count) — never a generic confirmation.
- No gradients, no glassmorphism, no emoji in UI copy.
- UI copy in ENGLISH.
- Money amounts, seat/usage counts, invoice IDs, and any card-reference digits render in
  JetBrains Mono, consistent with the rest of the product's entity-ID vocabulary.
- No working payment-collection forms anywhere in the batch — obviously non-functional
  placeholders only (see screens 2 and 3).
- Screens 2–4 must read as the same product surface as screen 1 (same Settings hub, same card
  language); screen 5 reuses only the shared App-Shell rail, not the Settings hub.

## Export & return
**Open Design** (local app, REST-driven): one fresh project per screen (workaround for a known
daemon bug where follow-up runs in the same project/conversation silently drop the new
instruction) — `bunkai-bk-224-billing`, `-2`, `-3`, `-4`, `-5`, design system `user:bunkai` on
every project. Runs are started programmatically, sequential, one per screen. Generated files land
under each project's data directory; the orchestrating session copies the finished
`{screen-slug}.html` files into
`.context/designs/bunkai-test-management-tool/bk-224-billing/`.
