# Path E: LLM-authored custom DESIGN.md

> **Path role**: the terminal fallback when no off-the-shelf brand fits, and the bridge target for Path C (Open Design artifact) and Path D (Claude Design bundle).
> **Output**: `./DESIGN.md` (or a custom `design_md_path` from `.agents/project.yaml`).
> **Spec source of truth**: [`../assets/design-md-spec-summary.md`](../assets/design-md-spec-summary.md). Read it before generating tokens.

---

## Table of contents

1. [Purpose](#1-purpose)
2. [Inputs](#2-inputs)
3. [Pre-flight](#3-pre-flight)
4. [Context synthesis](#4-context-synthesis)
5. [Generation flow (section-by-section)](#5-generation-flow-section-by-section)
6. [Validation step](#6-validation-step)
7. [Output checklist](#7-output-checklist)
8. [Bridge-mode notes (Paths C and D)](#8-bridge-mode-notes-paths-c-and-d)
9. [Iterations: targeted re-roll](#9-iterations-targeted-re-roll)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Purpose

Use this path when one of these is true:

- No off-the-shelf brand matches. The `getdesign` matcher (Path B, the default) scored its top 3 below the confidence threshold, or the user rejected every suggestion.
- The business is too niche. The vertical or audience is so specific that adapting an existing system costs more than authoring a fresh one (for example "kids STEM education platform 8-12 years", "veterinary telehealth for rural Argentina").
- The user wants a full custom system. They have no interest in galleries and want the LLM to compose the identity from the Constitution and PRD.
- Bridge target for Path C (Open Design). The user iterated in the Docker app and has an `.od/artifacts/` folder, but Open Design does not emit DESIGN.md natively, so this path converts the artifact.
- Bridge target for Path D (Claude Design). The user exported a bundle from `claude.ai/design` (HTML/CSS, tokens.json, README), and this path converts it to DESIGN.md.

This is the bridge because it is the only path that produces DESIGN.md by composition instead of by download. A conversion is a composition with more pre-decided constraints: the same flow with more anchored inputs.

---

## 2. Inputs

### Required (at least one)

| Input                 | Path                                  | What we extract                                           |
| --------------------- | ------------------------------------- | --------------------------------------------------------- |
| Constitution          | `.context/business/business-model.md` | Industry, target market, value-prop tone                  |
| PRD personas          | `.context/PRD/personas.md`            | Demographic, tech-savviness, aesthetic preferences        |
| PRD executive summary | `.context/PRD/executive-summary.md`   | Competitive positioning, must-have visual cues            |
| Direct Q&A            | (interactive, fallback)               | Industry, tone, target, competitors, keywords, WCAG level |

If none exist (brownfield, or first time on this repo), go straight to the Q&A in §4.

### Optional: bridge mode

| Input                | Path                                   | Origin path |
| -------------------- | -------------------------------------- | ----------- |
| Open Design artifact | `./.od/artifacts/<timestamp>-<slug>/`  | Path C      |
| Open Design slug     | (string, e.g. `linear-app-warm-v2`)    | Path C      |
| Claude Design bundle | `design/handoff/<slug>.zip` (unzipped) | Path D      |
| Claude Design tokens | `design/handoff/<slug>/tokens.json`    | Path D      |
| Claude Design README | `design/handoff/<slug>/README.md`      | Path D      |

When bridge inputs exist, their tokens are authoritative and you do not override them. Your job is to wrap them in the DESIGN.md structure and author the rationale prose.

---

## 3. Pre-flight

Run these checks before generating:

1. Spec asset present. Confirm `.agents/skills/design-system/assets/design-md-spec-summary.md` exists and is readable. It is the schema source of truth, and without it the generation can drift from the spec.
2. Linter available. Run `npx --yes @google/design.md --version`. If it succeeds, lint will work after generation. If it fails (offline, npm registry down), warn the user: "Linter unavailable. Generation will proceed, but lint validation must be re-run later when online."
3. Target path is clear. Read `.agents/project.yaml` → `design_md_path` (default `./DESIGN.md`). If the file exists, ask the user: skip / overwrite / save-as-variant (`DESIGN.dark.md`, `DESIGN.v2.md`). With nobody at the keyboard, save as a variant and report where it is.
4. WCAG target. Ask the user, or read it from the PRD: AA is mandatory (the default) or AAA. AAA constrains the palette heavily, so flag it early. With nobody at the keyboard, use AA unless the PRD says otherwise, and say so in the report.

---

## 4. Context synthesis

`DESIGN.md` translates business intent into visual tokens, and thin input gives generic output. Spend the time here.

### From Constitution (`business-model.md`)

Extract:

- Industry: a vertical keyword (fintech, healthtech, edtech, ecommerce, SaaS-internal, marketplace, ...). It drives the reference palette family.
- Target market: B2B, B2C, B2B2C or internal. It drives information density and formality.
- Value-prop tone: analytical, warm, authoritative, playful, premium, accessible, scrappy. It drives type personality and color saturation.

### From PRD personas (`personas.md`)

For each persona, extract:

- Demographic: age range and geography. They anchor typography choices (older audiences need a larger base size and higher contrast).
- Tech-savviness: novice, intermediate or power. It drives information density and affordance visibility (more chrome for novices, less for power users).
- Aesthetic quotes: preferences quoted from the persona descriptions. "She values clean dashboards like Linear" makes Linear a primary brand reference.

### From PRD executive summary

Extract:

- Competitive positioning: who we compete with. These are brand references for the matcher, and they also show what not to look like (differentiate from the leader instead of cloning it).
- Must-have visual cues, explicit or implicit. "We are the trustworthy alternative" suggests high-contrast neutrals, a restrained accent and serif headers.

### From bridge inputs (Paths C and D)

When they exist, they are pre-decided constraints, and you skip the synthesis from scratch above:

- Open Design artifact: read `manifest.json` or the equivalent for the slug and iteration metadata, and extract token decisions verbatim.
- Claude Design `tokens.json`: the source of truth for all token values. The README informs the Overview prose only.

### Q&A fallback (no inputs)

When the Constitution and PRD are absent and there are no bridge inputs, ask a tight set of six questions:

1. Industry or vertical?
2. Tone (3 adjectives, picked from: serious, playful, premium, accessible, warm, cool, technical, friendly)?
3. Target audience (B2B / B2C / internal / mixed)?
4. Three reference brands the user admires (visual reference)?
5. Three keywords that should not describe the system (anti-references)?
6. WCAG level: AA (default) or AAA?

Six questions is the minimum input that gives non-generic output. With less, the generation falls back to the AI-default look (purple-blue gradient, Inter, stock shadcn).

With nobody at the keyboard, you cannot ask. Use the brief when it answers them. Otherwise follow `agentic-dev-core/references/decision-protocol.md`: mine the repo for the answers (README, landing copy, package description), record each assumed answer in the report, and continue. If the repo gives you no signal for industry and tone, stop before writing the file and report what is missing, because a guess here produces exactly the generic output this step exists to prevent.

---

## 5. Generation flow (section-by-section)

Generate the sections in order and do not skip or reorder them. The Google Labs spec prescribes the order, the lint rule `section-order` enforces it, and downstream agents rely on the progression: Overview frames intent, Colors anchor identity, and Components reference both.

### 5.1 Overview

Two to three paragraphs of prose covering:

- The visual theme in one phrase (for example "Architectural Minimalism meets Journalistic Gravitas").
- The atmosphere or mood (warm, clinical, premium, kinetic).
- The intent, meaning what the user should feel on first paint.

Bridge variant: when the input comes from Path C or D, anchor the Overview to the source ("Inspired by the `<slug>` system from Open Design, adapted for <our context>."). The user may come back in six months and forget where the tokens came from.

### 5.2 Colors

YAML frontmatter (hex values verbatim) plus markdown rationale, one bullet per role.

Required roles: `primary`, `secondary`, `tertiary`, `neutral`, `background`, `text`, `border`, `success`, `warning`, `error`.

Every hex justifies in one line why this hue fits this role. Examples:

- `Primary (#1A1C1E): Deep ink for headlines — communicates gravitas; not pure black to avoid digital harshness.`
- `Tertiary (#B8422E): Boston Clay — sole driver for interaction. Restrained warmth signals trustworthiness without playfulness.`

Bridge variant: copy the hex values from `tokens.json` (Path D) or the Open Design manifest (Path C) verbatim, and write the rationale yourself from the bundle README plus your synthesis.

### 5.3 Typography

Frontmatter: families (with fallbacks), the scale (h1-h6, body, caption), weights, line-heights and letter-spacing per role.

Markdown rationale: one or two sentences per family choice, with the fallback stack stated explicitly (for example `Public Sans, -apple-system, BlinkMacSystemFont, sans-serif`).

Keep the pairing tight: one display family and one body family, sometimes one mono for code. More than three families is noise, not identity.

### 5.4 Layout

Frontmatter: the `spacing` scale (`xs` through `2xl`, base unit typically 4px or 8px).

Markdown: state the base unit, the scale multiplier (linear 4-8-12-16 or geometric 4-8-16-32), the container max-widths (sm/md/lg/xl breakpoints) and the grid system (12-column by default, or 8-column or 4-column for niche cases).

### 5.5 Elevation & Depth

Frontmatter (optional, since components reference these): shadow tokens by level (`sm`, `md`, `lg`, `xl`).

Markdown: the z-index layer convention (for example base 0, dropdown 100, modal 1000, toast 10000). Encoding elevation as tokens matters because rebrands often shift from flat to layered, and named levels make that shift mechanical.

### 5.6 Shapes

Frontmatter: the `rounded` scale (`sm`, `md`, `lg`, `full`).

Markdown: the corner conventions (for example "buttons use `md` (8px); cards use `lg` (12px); avatars use `full`"). Without conventions every component picks its own radius and the system looks accidental.

### 5.7 Components

The frontmatter `components:` keyspace. The minimum is `button`, `input`, `card`, `modal`. Each entry references tokens (no raw hex), with size variants (`sm`, `md`, `lg`) and state variants (`default`, `hover`, `active`, `disabled`, `focus`).

A minimal component entry:

```yaml
components:
  button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.background}'
    borderRadius: '{rounded.md}'
    paddingX: '{spacing.md}'
    paddingY: '{spacing.sm}'
    fontWeight: 600
```

Markdown: per component, document the size and state grid (a table or bullet list). Leave the pixel-level detail to the frontmatter.

### 5.8 Do's and Don'ts

Five to ten rules per side, across three categories:

- Voice and tone: when to use the accent color and when to stay neutral.
- Accessibility: an explicit AA or AAA commitment and the patterns to avoid (no color-only state, no body text under 16px, no touch targets under 44px).
- Brand consistency: two or three lookalikes to avoid drifting toward.

Example Don'ts:

- Don't pair `tertiary` with `warning`: both warm, creates confusion.
- Don't use `body-sm` for primary CTA labels: affordance loss.
- Don't use shadow `xl` outside of modal overlays: devalues hierarchy.

---

## 6. Validation step

Run `npx --yes @google/design.md lint <design_md_path>` after writing.

If lint reports findings:

1. `broken-ref` (error): a component references a token that does not exist. Define the missing token or rewrite the reference. Do not inline a hex value as a workaround, because that defeats the rebrand mechanic.
2. `missing-primary` (warning): `colors.primary` is missing. Add it.
3. `contrast-ratio` (warning): a component's `backgroundColor`/`textColor` pair fails WCAG AA (4.5:1). Strategy:
   - Move the lighter color toward more contrast, but stay on-brand instead of darkening arbitrarily.
   - If the primary/text pairing fails, shift hue and not only lightness (for example `#5A6470` to `#3A4450` keeps the slate identity and raises contrast).
   - Document the rationale in the Colors section ("we shifted slate from #5A6470 to #3A4450 to meet AA against neutral background").
4. `orphaned-tokens` (warning): a color no component uses. Add a component that references it or remove the token. Orphans bloat the file and confuse rebrand attempts.
5. `section-order` (warning): re-emit the sections in canonical order (Overview → Colors → Typography → Layout → Elevation → Shapes → Components → Do's/Don'ts).

If one section is malformed, regenerate only that section. Re-roll the whole file only when the linter exits with several structural errors.

---

## 7. Output checklist

Before you declare done, verify:

- [ ] YAML frontmatter present with at minimum: `name`, `colors.primary`, `typography.*`, `spacing`, `rounded`, `components` (≥4 entries).
- [ ] 8 prescribed sections in correct order (or documented omissions only when no tokens of that kind exist).
- [ ] `npx @google/design.md lint <path>` exits 0 (or only `info`-severity findings).
- [ ] WCAG AA passes for primary/background and text/background pairs (AA is non-negotiable; AAA per project requirement).
- [ ] File written to `./DESIGN.md` (or the path declared in `.agents/project.yaml` `design_md_path`).
- [ ] Source of inputs documented in Overview (which Constitution/PRD/bundle informed the synthesis).

---

## 8. Bridge-mode notes (Paths C and D)

### From Open Design (Path C)

- The `design-system slug` (for example `linear-app-warm-v2`) becomes the Overview anchor: "Inspired by the `linear-app-warm-v2` system iterated in Open Design; adapted for <our context>."
- Token values from the iteration manifest are preserved exactly. You author the prose around them and never overwrite hex values.
- If the Open Design output lacks fields the spec expects (for example no `success`/`warning`/`error`), extend with on-brand additions and note the extension in the Colors section.

### From Claude Design (Path D)

- `tokens.json` values are the source of truth. Write them verbatim into the frontmatter.
- The bundle's README hints inform the Overview and Do's/Don'ts prose only. They do not override tokens.
- If `tokens.json` ships partial coverage (for example only colors and typography, no spacing), author the missing scales with the same disciplined defaults from §5.4-5.6.
- The user paid for the Claude Design output, so respect it. The bridge step adds structure (the DESIGN.md format) and prose, and no opinion of its own.

### Conflict resolution

If bridge inputs violate WCAG AA (for example a brand pair from the bundle fails contrast), do not fix it silently. Surface it to the user:

> "The `primary`/`background` pair from your Claude Design bundle (`#5A6470` on `#F0F2F5`) measures 3.2:1 — below AA. Propose nearest on-brand adjustment: `#3A4450` (4.7:1). Accept, reject, or override?"

With nobody at the keyboard, write the bundle's values as delivered, record the failing pair and the proposed adjustment in the report and in the Do's and Don'ts, and leave the decision to the owner. Paid output is not overridden unattended.

---

## 9. Iterations: targeted re-roll

When the user is unhappy after generation, re-roll only the part they object to. Examples:

- "Re-roll the palette warmer": regenerate only the frontmatter `colors:` and the Colors markdown section. Re-lint after.
- "Change h1 to a serif": regenerate only `typography.h1` and the relevant Typography prose. Re-lint after.
- "Add a `chip` component": append to `components:` and add a Components markdown subsection. Re-lint after.

Keep the changes surgical. The user iterated on what is wrong, not on what is right, so re-rolling sibling sections wastes their time and risks regressions on parts they liked.

---

## 10. Troubleshooting

### Lint persistently fails with unfamiliar rule names

Schema drift: the cached `assets/design-md-spec-summary.md` is older than the current `@google/design.md` CLI. Fix:

1. Force-refresh: `npx --yes @google/design.md@latest lint <path>`.
2. Re-fetch the spec asset (see the asset's §9 "Re-fetch cadence").
3. Re-run.

### Constitution is too vague

Symptom: the generation produces a generic palette (purple/blue/cyan, Inter, default shadcn). Cause: the synthesis did not have enough signal.

Fix: drop to the Q&A (§4 Q&A fallback). Six questions take the user about two minutes and the output improves a lot.

### Bridge tokens conflict with WCAG

See §8 "Conflict resolution". Surface it, propose an adjustment, and leave the decision to the user.

### User says "too corporate" or "too playful" after generation

Probably a tone mismatch in the synthesis. Ask the user to pick 3 adjectives from this list: serious, playful, premium, accessible, warm, cool, technical, friendly. Re-roll palette and typography only (§9 targeted re-roll) and keep everything else.

### Same brand reference keeps surfacing for different projects

The LLM is defaulting. Add an explicit "avoid looking like X" line to the synthesis input on the next iteration. Anti-references constrain the design space more effectively than positive references do in AI authoring.

### File written but downstream `/project-bootstrap` doesn't pick it up

Check that `.agents/project.yaml` `design_md_path` matches where you wrote the file. The default is `./DESIGN.md`. If the project overrides the path (for example `.context/DESIGN.md`), the frontend-setup pre-flight reads from that path.
