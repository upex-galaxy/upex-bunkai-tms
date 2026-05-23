# Delta Specs Pattern (optional)

> **Status:** OPTIONAL pattern. The default `product-management` flow edits acceptance criteria **in place** on each story. Only adopt delta specs when one of the conditions in [§ When to use](#when-to-use) actually holds — the overhead is real.
>
> **Scope:** Methodology + local-file pattern only. This workflow does NOT push rich-text content to the issue tracker — all artifacts live under `.context/PBI/`. If a future extension publishes deltas to Jira, route through `[ISSUE_TRACKER_TOOL]` and see `references/jira-publishing-gotchas.md` for ADF rules.

---

## Purpose

A rigorous, opt-in alternative to in-place acceptance-criteria editing. Instead of mutating a feature's AC every time a new story changes its behavior, you maintain a stable **source-of-truth spec per feature** and emit a small **delta spec per story** that captures only what is **ADDED**, **MODIFIED**, or **REMOVED** by that story. On story close, the delta is merged back into the source-of-truth and the change folder is archived.

The pattern uses two well-known constructs to keep deltas verifiable:

- **RFC 2119 keywords** (`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`) for normative language
- **Gherkin scenarios** (`Given` / `When` / `Then` / `And`) for behavior that can be turned directly into tests

Adapted to our PBI-centric layout (every change is keyed by a Jira ticket, not a free-form change name).

---

## When to use

Adopt delta specs when **at least one** of these conditions applies:

- **Concurrent devs on the same feature.** Two PRs editing the same `feature.md` in place conflict on every merge; each ticket writing its own `spec.md` sidesteps this.
- **Compliance / audit requirements.** Auditors get a git-diffable, normative changelog per ticket — not edits hidden inside diff history.
- **High-churn capabilities.** Areas where AC shifts every sprint (auth, billing, pricing) benefit from explicit history of additions/modifications/removals.
- **Multi-team ownership.** When a feature crosses team boundaries, the delta becomes the contract — each team reviews only what touches them.

**Do NOT use delta specs for** solo / small-team work, throwaway prototypes, or one-time setup stories. The default in-place flow in `references/acceptance-criteria.md` is fine.

If unsure, default to in-place editing. Migration toward delta specs is straightforward (see [§ Migration](#migration)); migration away is harder.

---

## Source-of-truth specs

The source of truth for a feature lives at `.context/PBI/specs/{capability}/{feature}.md`, where `{capability}` is a logical grouping (domain / bounded context — `auth/`, `billing/`, `checkout/`) and `{feature}` is a kebab-case feature name (`login.md`, `password-reset.md`, `invoice-generation.md`).

Each `feature.md` is the **canonical, always-current** description of how that feature behaves. It is what QA, support, and onboarding read; it must always reflect production reality.

Structure of a `feature.md`:

```markdown
# {Feature Title}

> One-paragraph summary of what this feature does and why it exists.

## Requirements

### Requirement: {Requirement Title}

The system MUST/SHOULD/MAY {do something specific}.

#### Scenario: {Scenario Title}

- Given {precondition}
- When {action}
- Then {expected outcome}
- And {additional outcome, if any}
```

Multiple `### Requirement:` blocks per feature are normal. Each requirement should bundle 1–N scenarios.

---

## Delta spec structure

A delta spec lives alongside the Jira ticket that introduces the change:

```
.context/PBI/{ticket}/spec.md
```

Where `{ticket}` is the issue tracker key (e.g., `UPEX-277/`, `MYM-103/`).

Every delta spec has up to three top-level sections:

```markdown
# {Ticket} — {Short change title}

> Targets: `.context/PBI/specs/{capability}/{feature}.md`
> Related Jira: {ticket-url}

## ADDED Requirements

### Requirement: {New requirement title}

The system MUST {...}

#### Scenario: {Title}

- Given {...}
- When {...}
- Then {...}

## MODIFIED Requirements

### Requirement: {Existing requirement title — exact match with source-of-truth}

{FULL post-modification body — see "Copy-full-then-edit rule" below.}

#### Scenario: {Title}

- Given {...}
- When {...}
- Then {...}

## REMOVED Requirements

### Requirement: {Existing requirement title}

(Reason: {why this requirement no longer applies})
```

**Empty sections.** If a delta has no MODIFIED requirements, omit the `## MODIFIED Requirements` heading entirely (do not leave it empty as decoration). Same for ADDED and REMOVED. A delta that only adds new behavior contains only an `## ADDED Requirements` section.

**Targets header.** The `> Targets:` line at the top of the delta tells the archive process which source-of-truth file(s) to merge into. A delta that touches multiple features lists multiple targets.

---

## Requirement format

Each requirement is a `### Requirement: {Title}` block with:

1. **A normative body** using RFC 2119 keywords:

   | Keyword                      | Meaning                                    |
   | ---------------------------- | ------------------------------------------ |
   | **MUST** / **SHALL**         | Absolute requirement                       |
   | **MUST NOT** / **SHALL NOT** | Absolute prohibition                       |
   | **SHOULD**                   | Recommended; deviations need justification |
   | **SHOULD NOT**               | Discouraged; deviations need justification |
   | **MAY**                      | Optional / permitted                       |

   Form: `The system MUST {do something specific}.`

   Avoid vague verbs (handle, support, manage). Pick concrete behavior (returns, redirects, rejects with HTTP 401, displays a banner).

2. **One or more `#### Scenario:` blocks** in Gherkin:

   ```
   #### Scenario: User logs in with valid credentials

   - Given the user has a registered account with email "alice@example.com"
   - And the password "S3cret!" matches the stored hash
   - When the user submits the login form
   - Then the system creates a session
   - And redirects to /dashboard
   ```

   Constraints:
   - Keep each scenario to ~3–7 bullet lines. If you need more, split into multiple scenarios.
   - Scenarios MUST be testable — a developer should be able to write an automated test from each one without further questions.
   - Use concrete data (`"alice@example.com"`, `HTTP 401`, `wait 30s`) over vague data (`a valid email`, `an error`).

3. **Title naming.** `### Requirement: {Title Case Phrase}`. Stable across deltas — when modifying, the MODIFIED block's title MUST match the title in the source-of-truth exactly.

---

## Concrete example: adding 2FA to login

Suppose `auth/login.md` currently exists with one requirement:

```markdown
# Login

## Requirements

### Requirement: User Authentication

The system MUST authenticate users via email and password.

#### Scenario: Successful login

- Given a registered user with email "alice@example.com" and password "S3cret!"
- When the user submits the login form
- Then the system creates a session
- And redirects to /dashboard

#### Scenario: Wrong password

- Given a registered user with email "alice@example.com"
- When the user submits the form with password "wrong"
- Then the system rejects with HTTP 401
- And displays "Invalid email or password"
```

Ticket `UPEX-512` introduces optional 2FA. The delta spec at `.context/PBI/UPEX-512/spec.md`:

```markdown
# UPEX-512 — Add optional TOTP-based 2FA to login

> Targets: `.context/PBI/specs/auth/login.md`
> Related Jira: https://example.atlassian.net/browse/UPEX-512

## ADDED Requirements

### Requirement: Two-Factor Authentication Enrollment

A user MAY enroll in TOTP-based 2FA from their account settings. Once enrolled, the system MUST require a valid TOTP code at login in addition to email and password.

#### Scenario: User enrolls in 2FA

- Given a logged-in user without 2FA enabled
- When the user opens "Security" settings and clicks "Enable 2FA"
- Then the system displays a QR code linked to the user's TOTP secret
- And requires the user to confirm with a valid 6-digit code before enabling
- And persists `two_factor_enabled = true` on the user record

#### Scenario: Login with 2FA enabled

- Given a registered user with `two_factor_enabled = true`
- And a valid TOTP code "123456" generated from the user's secret
- When the user submits email + password and is prompted for a TOTP code
- And submits "123456" within 30 seconds
- Then the system creates a session
- And redirects to /dashboard

## MODIFIED Requirements

### Requirement: User Authentication

The system MUST authenticate users via email and password. If `two_factor_enabled = true` for the user, the system MUST additionally require a valid TOTP code before issuing a session.

#### Scenario: Successful login (2FA disabled)

- Given a registered user with email "alice@example.com", password "S3cret!", and `two_factor_enabled = false`
- When the user submits the login form
- Then the system creates a session
- And redirects to /dashboard

#### Scenario: Successful login (2FA enabled)

- Given a registered user with `two_factor_enabled = true`
- When the user submits valid email + password
- Then the system displays the TOTP prompt instead of creating a session
- And waits for the TOTP code submission

#### Scenario: Wrong password

- Given a registered user with email "alice@example.com"
- When the user submits the form with password "wrong"
- Then the system rejects with HTTP 401
- And displays "Invalid email or password"
```

Note how the **MODIFIED** block contains the **full** post-change requirement — original scenarios that still apply (`Successful login`, `Wrong password`) are reproduced, the modified one is updated (`Successful login` is split into 2FA-on / 2FA-off), and the new behavior is captured. See the next section for why this matters.

---

## Copy-full-then-edit rule

> **The single most important rule of delta specs.** Get this wrong and the archive step silently destroys content.

When writing a `## MODIFIED Requirements` block, follow this exact workflow:

1. Open the source-of-truth file (`.context/PBI/specs/{capability}/{feature}.md`).
2. **Copy the entire requirement block** — from `### Requirement: {Title}` through every `#### Scenario:` block under it.
3. Paste the copy under `## MODIFIED Requirements` in the delta spec.
4. **Edit the copy in place** — change the body, edit existing scenarios, add new ones, remove obsolete ones.

**Why this matters.** The archive process **replaces** the source-of-truth requirement with the MODIFIED block byte-for-byte. If your MODIFIED block contains only the changed scenario, archive will silently drop every scenario you didn't copy. The source-of-truth becomes lossy without anyone noticing — until QA finds a regression two sprints later.

**Common pitfall (do NOT do this):**

```markdown
## MODIFIED Requirements

### Requirement: User Authentication

Adding a TOTP step. ← wrong: not the full requirement, no scenarios

#### Scenario: Successful login (2FA enabled)

- Given ... ← only the new scenario; the old `Successful login` and `Wrong password` are now lost
```

After archive: the source-of-truth's `User Authentication` requirement loses its `Successful login` and `Wrong password` scenarios. They are gone unless you remember they existed.

**Correct shape (do this):** see the 2FA example above — every scenario that still applies is reproduced verbatim, the modified one is edited, and new ones are added.

**Tooling tip.** The archive script can be defensive: warn (or fail) if a MODIFIED block has fewer scenarios than the source-of-truth requirement it replaces. This is a strong signal of an incomplete delta.

---

## Archive process

When the story closes (PR merged + verified in staging/prod), the delta is folded into the source-of-truth:

1. **Pre-condition checks**
   - Story is in a closed Jira state (`Done`, `Closed`, or equivalent).
   - PR is merged to the integration branch.
   - The change has been verified — at minimum, the dev confirms behavior; ideally QA has signed off.

2. **Apply ADDED requirements**
   - For each `### Requirement:` block under `## ADDED Requirements`, **append** it to the target `feature.md` under its `## Requirements` section.
   - If a requirement with the same title already exists in the source-of-truth, the delta should have used MODIFIED instead — flag and stop.

3. **Apply MODIFIED requirements**
   - For each `### Requirement:` under `## MODIFIED Requirements`, locate the requirement with the same title in the target `feature.md`.
   - **Replace** the entire matched block (heading + body + all scenarios) with the MODIFIED block from the delta.
   - If no matching requirement is found, the delta should have used ADDED instead — flag and stop.

4. **Apply REMOVED requirements**
   - For each `### Requirement:` under `## REMOVED Requirements`, locate the matching block in the target `feature.md` and **delete** it.
   - Optionally write a one-line entry to a CHANGELOG with the removal reason.

5. **Move the change folder to archive**
   - Move `.context/PBI/{ticket}/` to `.context/PBI/archive/YYYY-MM-DD-{ticket}/`, where `YYYY-MM-DD` is the close date.
   - Add an `archive-report.md` inside the archived folder summarizing: requirements added/modified/removed, target file(s) updated, who archived it, when.

6. **Commit the archive**
   - One commit titled `archive(spec): {ticket} merged into {capability}/{feature}`.
   - The diff shows: target `feature.md` updates + the move of `{ticket}/` to `archive/`.

After archive: the canonical truth lives only in `.context/PBI/specs/`. The archived delta is historical record.

---

## In-place vs delta — tradeoffs

| Aspect                            | In-place AC editing                               | Delta specs                                                        |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Overhead per story                | Low (edit AC, done)                               | Medium (write delta, then archive on close)                        |
| Conflict surface (concurrent PRs) | High when 2+ stories touch same feature           | Low — each story has its own `spec.md`                             |
| Audit / changelog                 | Implicit in git history (mixed wording vs intent) | Explicit per-ticket diff with normative language                   |
| Source-of-truth clarity           | Always lives in feature doc, but mutates silently | Stable feature doc + explicit archive trail                        |
| Onboarding cost                   | Near zero (read AC in story)                      | Higher — newcomer must understand the pattern + RFC 2119 + Gherkin |
| Risk of silent loss               | Low                                               | Medium if copy-full-then-edit rule is violated                     |
| Suits solo / small team           | Yes                                               | Overkill                                                           |
| Suits multi-team / compliance     | Painful at scale                                  | Designed for this case                                             |

**Default.** In-place editing wins for most teams. Delta specs are the right tool only when the conditions in [§ When to use](#when-to-use) actually hold.

---

## Migration

Adopting delta specs after a history of in-place editing:

1. **Pick a capability boundary, not the whole repo.** Start with one high-churn capability (e.g., `auth/`) and leave the rest on in-place editing. Mixed mode is fine.
2. **Snapshot current AC into source-of-truth.** Consolidate existing AC into `feature.md` files under `.context/PBI/specs/{capability}/` using RFC 2119 + Gherkin. The snapshot is the new canonical truth.
3. **Cut over on the next story.** From the next ticket forward, write a delta `spec.md` instead of editing AC in place. Update the story-refinement checklist accordingly.
4. **Archive policy.** Decide who runs the archive step (typically the dev who merges the PR, or the PM on story close).
5. **Tooling (optional).** Add a script to validate deltas (target exists, MODIFIED has ≥ scenarios than source, ADDED titles do not collide, REMOVED titles exist).
6. **Roll out gradually.** Extend if the first capability is a win; revert if overhead exceeds value. Reverse migration (delta → in-place) is harder — be intentional.
