# Delta specs pattern (optional)

> **Status:** optional. The default `product-management` flow edits acceptance criteria in place on each story. Adopt delta specs only when a condition in [§ When to use](#when-to-use) holds, because the overhead is real.
>
> **Scope:** methodology and a local-file pattern. Nothing here pushes rich text to the issue tracker; every artifact lives under `.context/specs/`, a committed tree. If you later publish deltas to Jira, go through `[ISSUE_TRACKER_TOOL]` and follow the ADF rules in `references/jira-publishing-gotchas.md`.
>
> **Why `.context/specs/` and not `.context/PBI/`:** everything under `.context/PBI/` is the gitignored Jira cache (`.agents/instructions/agent-local-context-pbi.md` §9). The sync rebuilds it, nobody commits it, and no hand-written file there can be relied on. Specs, deltas and their archive are written by hand and must reach git, since a git-diffable changelog is the whole value of the pattern, so they live in their own committed tree. Do not add `.gitignore` negations under `.context/PBI/` for them, and do not write, move or archive anything inside a synced story folder.
>
> **Writing the delta:** where a project has adopted delta specs, the spec written from the conversation (the step in `add-feature.md`) fills the delta spec instead of the epic description.

---

## Purpose

Delta specs are an opt-in, stricter alternative to editing acceptance criteria in place. Instead of rewriting a feature's AC whenever a story changes its behavior, you keep one stable source-of-truth spec per feature and write a small delta spec per story. The delta captures only what the story ADDED, MODIFIED or REMOVED. When the story closes, the delta merges back into the source of truth and the change folder is archived.

Two constructs keep deltas verifiable:

- RFC 2119 keywords (`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`) for normative language.
- Gherkin scenarios (`Given` / `When` / `Then` / `And`) for behavior that turns directly into tests.

The layout is keyed by Jira ticket, not by a free-form change name.

---

## When to use

Adopt delta specs when at least one of these holds:

- Several developers work on the same feature. Two PRs editing the same `feature.md` in place conflict on every merge, and a `spec.md` per ticket avoids that.
- Compliance or audit requires a git-diffable, normative changelog per ticket, not edits buried in diff history.
- A capability churns (auth, billing, pricing) and its AC shifts every sprint, so an explicit record of additions, modifications and removals pays off.
- A feature crosses team boundaries. The delta becomes the contract, and each team reviews only what touches it.

Skip delta specs for solo or small-team work, throwaway prototypes and one-time setup stories. The default in-place flow in `references/acceptance-criteria.md` is enough there.

When unsure, edit in place. Moving toward delta specs is easy (see [§ Migration](#migration)); moving back is harder.

---

## Source-of-truth specs

The source of truth for a feature lives at `.context/specs/{capability}/{feature}.md`. `{capability}` is a logical grouping such as a domain or bounded context (`auth/`, `billing/`, `checkout/`), and `{feature}` is a kebab-case feature name (`login.md`, `password-reset.md`, `invoice-generation.md`).

Each `feature.md` is the canonical, current description of how the feature behaves. QA, support and onboarding read it, so it has to match production.

A `feature.md` looks like this:

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

A feature normally has several `### Requirement:` blocks, each bundling one or more scenarios.

---

## Delta spec structure

A delta spec lives in a change folder named after the Jira ticket that introduces the change:

```
.context/specs/changes/{ticket}/spec.md
```

`{ticket}` is the issue tracker key (for example `UPEX-277` or `MYM-103`). The story's synced cache folder under `.context/PBI/` stays untouched. If reviewers need to find the delta, link it from the story with a Jira comment.

A delta spec has up to three top-level sections:

```markdown
# {Ticket} - {Short change title}

> Targets: `.context/specs/{capability}/{feature}.md`
> Related Jira: {ticket-url}

## ADDED Requirements

### Requirement: {New requirement title}

The system MUST {...}

#### Scenario: {Title}

- Given {...}
- When {...}
- Then {...}

## MODIFIED Requirements

### Requirement: {Existing requirement title, exact match with source of truth}

{FULL post-modification body, see "Copy-full-then-edit rule" below.}

#### Scenario: {Title}

- Given {...}
- When {...}
- Then {...}

## REMOVED Requirements

### Requirement: {Existing requirement title}

(Reason: {why this requirement no longer applies})
```

Leave out a section a delta does not use. With no MODIFIED requirements, there is no `## MODIFIED Requirements` heading at all, and the same goes for ADDED and REMOVED. A delta that only adds behavior has only an `## ADDED Requirements` section.

The `> Targets:` line at the top tells the archive step which source-of-truth files to merge into. A delta that touches several features lists several targets.

---

## Requirement format

Each requirement is a `### Requirement: {Title}` block with a normative body, one or more scenarios, and a stable title.

1. A normative body in RFC 2119 keywords:

   | Keyword                      | Meaning                                    |
   | ---------------------------- | ------------------------------------------ |
   | **MUST** / **SHALL**         | Absolute requirement                       |
   | **MUST NOT** / **SHALL NOT** | Absolute prohibition                       |
   | **SHOULD**                   | Recommended; deviations need justification |
   | **SHOULD NOT**               | Discouraged; deviations need justification |
   | **MAY**                      | Optional / permitted                       |

   Form: `The system MUST {do something specific}.`

   Pick concrete behavior (returns, redirects, rejects with HTTP 401, displays a banner) over vague verbs like handle, support or manage.

2. One or more `#### Scenario:` blocks in Gherkin:

   ```
   #### Scenario: User logs in with valid credentials

   - Given the user has a registered account with email "alice@example.com"
   - And the password "S3cret!" matches the stored hash
   - When the user submits the login form
   - Then the system creates a session
   - And redirects to /dashboard
   ```

   - Keep each scenario to about 3 to 7 bullet lines, and split it when it needs more.
   - Make each scenario testable: a developer can write an automated test from it without further questions.
   - Use concrete data (`"alice@example.com"`, `HTTP 401`, `wait 30s`), not vague data (`a valid email`, `an error`).

3. A stable title, written `### Requirement: {Title Case Phrase}`. When a delta modifies a requirement, the MODIFIED block's title must match the source-of-truth title exactly, because the archive step matches on it.

---

## Example: adding 2FA to login

Suppose `auth/login.md` already exists with one requirement:

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

Ticket `UPEX-512` introduces optional 2FA. The delta spec at `.context/specs/changes/UPEX-512/spec.md`:

```markdown
# UPEX-512 - Add optional TOTP-based 2FA to login

> Targets: `.context/specs/auth/login.md`
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

The MODIFIED block holds the full post-change requirement. Scenarios that still apply (`Wrong password`) are reproduced, `Successful login` is split into 2FA-on and 2FA-off, and the new behavior is captured. The next section says why.

---

## Copy-full-then-edit rule

> This is the most important rule of delta specs. Break it and the archive step silently destroys content.

When you write a `## MODIFIED Requirements` block:

1. Open the source-of-truth file (`.context/specs/{capability}/{feature}.md`).
2. Copy the entire requirement block, from `### Requirement: {Title}` through every `#### Scenario:` under it.
3. Paste the copy under `## MODIFIED Requirements` in the delta spec.
4. Edit the copy in place: change the body, edit existing scenarios, add new ones, remove obsolete ones.

The archive step replaces the source-of-truth requirement with the MODIFIED block byte for byte. A MODIFIED block holding only the changed scenario makes archive drop every scenario you did not copy. The source of truth loses content and nobody notices until QA finds a regression two sprints later.

The wrong shape:

```markdown
## MODIFIED Requirements

### Requirement: User Authentication

Adding a TOTP step. ← wrong: not the full requirement, no scenarios

#### Scenario: Successful login (2FA enabled)

- Given ... ← only the new scenario; the old `Successful login` and `Wrong password` are now lost
```

After archive, the source-of-truth `User Authentication` requirement has lost its `Successful login` and `Wrong password` scenarios, and they stay lost unless someone remembers them.

The right shape is the 2FA example above: every scenario that still applies is reproduced verbatim, the modified one is edited, and new ones are added.

An archive script can guard against this by warning or failing when a MODIFIED block has fewer scenarios than the requirement it replaces. That count is a strong sign of an incomplete delta.

---

## Archive process

When the story closes (PR merged and verified in staging or production), fold the delta into the source of truth:

1. Check the preconditions.
   - The story is in a closed Jira state (`Done`, `Closed` or equivalent).
   - The PR is merged to the integration branch.
   - The change is verified: at minimum the developer confirms the behavior, ideally QA has signed off.

2. Apply ADDED requirements.
   - Append each `### Requirement:` block under `## ADDED Requirements` to the target `feature.md`, under its `## Requirements` section.
   - If a requirement with the same title already exists there, the delta should have used MODIFIED. Flag it and stop.

3. Apply MODIFIED requirements.
   - For each `### Requirement:` under `## MODIFIED Requirements`, find the requirement with the same title in the target `feature.md`.
   - Replace the whole matched block (heading, body and all scenarios) with the MODIFIED block from the delta.
   - If no requirement matches, the delta should have used ADDED. Flag it and stop.

4. Apply REMOVED requirements.
   - For each `### Requirement:` under `## REMOVED Requirements`, find the matching block in the target `feature.md` and delete it.
   - Optionally add a one-line CHANGELOG entry with the removal reason.

5. Move the change folder to the archive.
   - Move `.context/specs/changes/{ticket}/` to `.context/specs/archive/YYYY-MM-DD-{ticket}/`, where `YYYY-MM-DD` is the close date. Only the change folder moves; the story's synced cache under `.context/PBI/` is never touched.
   - Add an `archive-report.md` to the archived folder with the requirements added, modified and removed, the target files updated, who archived it and when.

6. Commit the archive.
   - Use one commit titled `archive(spec): {ticket} merged into {capability}/{feature}`.
   - The diff shows the target `feature.md` updates and the move of `changes/{ticket}/` to `archive/`.

After archive, the canonical truth lives only in `.context/specs/{capability}/`, and the archived delta is the historical record.

---

## In-place vs delta tradeoffs

| Aspect                            | In-place AC editing                               | Delta specs                                                        |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Overhead per story                | Low (edit AC, done)                               | Medium (write delta, then archive on close)                        |
| Conflict surface (concurrent PRs) | High when 2+ stories touch same feature           | Low, each story has its own `spec.md`                             |
| Audit / changelog                 | Implicit in git history (wording mixed with intent) | Explicit per-ticket diff with normative language                   |
| Source-of-truth clarity           | Always lives in feature doc, but mutates silently | Stable feature doc + explicit archive trail                        |
| Onboarding cost                   | Near zero (read AC in story)                      | Higher, a newcomer must learn the pattern, RFC 2119 and Gherkin |
| Risk of silent loss               | Low                                               | Medium if copy-full-then-edit rule is violated                     |
| Suits solo / small team           | Yes                                               | Overkill                                                           |
| Suits multi-team / compliance     | Painful at scale                                  | Designed for this case                                             |

In-place editing wins for most teams. Use delta specs only when a condition in [§ When to use](#when-to-use) holds.

---

## Migration

Adopting delta specs after a history of in-place editing:

1. Pick one capability boundary, not the whole repo. Start with a high-churn capability (for example `auth/`) and leave the rest on in-place editing. Mixed mode is fine.
2. Snapshot the current AC into source-of-truth `feature.md` files under `.context/specs/{capability}/`, in RFC 2119 and Gherkin. The snapshot becomes the canonical truth.
3. Cut over on the next story. From the next ticket on, write a delta `spec.md` instead of editing AC in place, and update the story-refinement checklist to match.
4. Decide who runs the archive step. Usually that is the developer who merges the PR, or the PM when the story closes.
5. Optionally add a script that validates deltas: the target exists, MODIFIED has at least as many scenarios as the source, ADDED titles do not collide, REMOVED titles exist.
6. Extend gradually. Keep going if the first capability pays off, and revert if the overhead exceeds the value. Moving from delta back to in-place is harder, so do it deliberately.
