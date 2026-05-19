# Path E — LLM-authored custom DESIGN.md

> **Path role**: terminal fallback (no off-the-shelf brand fits) AND bridge target for Path C (Open Design artifact) and Path D (Claude Design bundle).
> **Output**: `./DESIGN.md` (or custom `design_md_path` from `.agents/project.yaml`).
> **Spec source of truth**: [`../assets/design-md-spec-summary.md`](../assets/design-md-spec-summary.md) — read this BEFORE generating tokens.

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
9. [Iterations — targeted re-roll](#9-iterations--targeted-re-roll)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Purpose

Use this path when one of these is true:

- **No off-the-shelf brand matches**. The `getdesign` matcher (Path B default) scored top-3 below confidence threshold or the user rejected all suggestions.
- **Business is too niche**. Vertical or audience is so specific that adapting an existing system costs more than authoring fresh (e.g. "kids STEM education platform 8–12 years", "veterinary telehealth for rural Argentina").
- **User explicitly wants full custom**. No interest in galleries; wants the LLM to compose identity from Constitution + PRD.
- **Bridge target for Path C** (Open Design): the user iterated in the Docker app, has an `.od/artifacts/` folder, but Open Design does not emit DESIGN.md natively. This path converts the artifact.
- **Bridge target for Path D** (Claude Design): the user exported a bundle from `claude.ai/design` (HTML/CSS + tokens.json + README). This path converts the bundle to DESIGN.md.

Why this path is the bridge: it is the only path that produces DESIGN.md by composition (not by download). Conversion is a composition with extra pre-decided constraints — same flow, more anchored inputs.

---

## 2. Inputs

### Required (at least one)

| Input                 | Path                                  | What we extract                                           |
| --------------------- | ------------------------------------- | --------------------------------------------------------- |
| Constitution          | `.context/business/business-model.md` | Industry, target market, value-prop tone                  |
| PRD personas          | `.context/PRD/personas.md`            | Demographic, tech-savviness, aesthetic preferences        |
| PRD executive summary | `.context/PRD/executive-summary.md`   | Competitive positioning, must-have visual cues            |
| Direct Q&A            | (interactive, fallback)               | Industry, tone, target, competitors, keywords, WCAG level |

If NONE exist (brownfield / first-time-on-this-repo), drop straight to Q&A — see §4.

### Optional — bridge mode

| Input                | Path                                   | Origin path |
| -------------------- | -------------------------------------- | ----------- |
| Open Design artifact | `./.od/artifacts/<timestamp>-<slug>/`  | Path C      |
| Open Design slug     | (string, e.g. `linear-app-warm-v2`)    | Path C      |
| Claude Design bundle | `design/handoff/<slug>.zip` (unzipped) | Path D      |
| Claude Design tokens | `design/handoff/<slug>/tokens.json`    | Path D      |
| Claude Design README | `design/handoff/<slug>/README.md`      | Path D      |

When bridge inputs exist, treat their tokens as **authoritative** — do not override. The LLM's job is to wrap them in the DESIGN.md structure plus author the rationale prose.

---

## 3. Pre-flight

Run these checks before generating. Why each matters:

1. **Spec asset present**: confirm `.claude/skills/design-system/assets/design-md-spec-summary.md` exists and is readable. This is the schema source of truth. Without it, the LLM can drift from the spec.
2. **Linter available**: run `npx --yes @google/design.md --version`. If it succeeds, lint will work post-generation. If it fails (offline, npm registry down), WARN the user: "Linter unavailable — generation will proceed but lint validation must be re-run later when online."
3. **Target path is clear**: read `.agents/project.yaml` → `design_md_path` (default `./DESIGN.md`). If file exists, ask the user: skip / overwrite / save-as-variant (`DESIGN.dark.md`, `DESIGN.v2.md`).
4. **WCAG target**: ask the user (or read from PRD) — AA mandatory (default) or AAA. AAA constrains palette severely; flag this early.

---

## 4. Context synthesis

Why synthesis matters: the DESIGN.md is a translation of business intent into visual tokens. Garbage in → generic output. Spend time here.

### From Constitution (`business-model.md`)

Extract:

- **Industry** — vertical keyword (fintech, healthtech, edtech, ecommerce, SaaS-internal, marketplace, ...). Drives reference palette family.
- **Target market** — B2B / B2C / B2B2C / internal. Drives information density and formality.
- **Value-prop tone** — analytical, warm, authoritative, playful, premium, accessible, scrappy. Drives type personality and color saturation.

### From PRD personas (`personas.md`)

For each persona, extract:

- **Demographic** — age range, geography. Anchors typography choices (e.g. older audiences need larger base size and higher contrast).
- **Tech-savviness** — novice / intermediate / power. Drives information density and affordance visibility (more chrome for novice, less for power).
- **Aesthetic quotes** — direct preferences mined from persona descriptions. E.g. "she values clean dashboards like Linear" → primary brand reference.

### From PRD executive summary

Extract:

- **Competitive positioning** — who we compete with. Brand references for the matcher; also tells you what to NOT look like (don't clone the leader; differentiate).
- **Must-have visual cues** — explicit requests or implicit (e.g. "we are the trustworthy alternative" → high-contrast neutrals, restrained accent, serif headers).

### From bridge inputs (Paths C/D)

If they exist, treat as pre-decided constraints (skip the synthesis-from-scratch above):

- **Open Design artifact**: read `manifest.json` or equivalent for slug + iteration metadata. Extract token decisions verbatim.
- **Claude Design `tokens.json`**: the source of truth for ALL token values. README informs Overview prose ONLY.

### Q&A fallback (no inputs)

If Constitution + PRD are absent and no bridge inputs exist, ask the user a tight 6-question set:

1. Industry / vertical?
2. Tone (3 adjectives — pick from: serious, playful, premium, accessible, warm, cool, technical, friendly)?
3. Target audience (B2B / B2C / internal / mixed)?
4. Three reference brands the user admires (visual reference)?
5. Three keywords that should NOT describe the system (anti-references)?
6. WCAG level: AA (default) or AAA?

Why these six: minimum viable input set to generate non-generic output. Anything less and the LLM falls back to AI-default aesthetic (purple-blue gradient, Inter font, generic shadcn).

---

## 5. Generation flow (section-by-section)

Generate IN ORDER. Do NOT skip or reorder. Why: Google Labs spec prescribes the order, the lint rule `section-order` enforces it, and downstream agents reading the file rely on contextual progression (Overview frames intent → Colors anchor identity → Components reference both).

### 5.1 Overview

Two to three paragraphs of prose. State:

- Visual theme in one phrase (e.g. "Architectural Minimalism meets Journalistic Gravitas").
- Atmosphere / mood (warm, clinical, premium, kinetic).
- Intent — what feeling should the user have on first paint.

**Bridge variant**: if input is from Path C/D, anchor the Overview to the source — "Inspired by the `<slug>` system from Open Design, adapted for <our context>." Why: traceability. The user may revisit this in 6 months and forget where the tokens came from.

### 5.2 Colors

YAML frontmatter (verbatim hex) + markdown rationale (one bullet per role).

Required roles: `primary`, `secondary`, `tertiary`, `neutral`, `background`, `text`, `border`, `success`, `warning`, `error`.

Per-color rationale rule: every hex must justify why-this-hue-for-this-role in one line. Examples:

- `Primary (#1A1C1E): Deep ink for headlines — communicates gravitas; not pure black to avoid digital harshness.`
- `Tertiary (#B8422E): Boston Clay — sole driver for interaction. Restrained warmth signals trustworthiness without playfulness.`

**Bridge variant**: copy hex values from `tokens.json` (Path D) or Open Design manifest (Path C) verbatim. Write the rationale yourself based on the bundle README + your synthesis.

### 5.3 Typography

Frontmatter: families (with fallbacks), scale (h1–h6, body, caption), weights, line-heights, letter-spacing per role.

Markdown rationale: 1–2 sentences per family choice. State fallback stack explicitly (e.g. `Public Sans, -apple-system, BlinkMacSystemFont, sans-serif`).

Pairing discipline: one display family + one body family (sometimes one mono for code). More than three families and you have noise, not identity.

### 5.4 Layout

Frontmatter: `spacing` scale (`xs` through `2xl`, base unit typically 4px or 8px).

Markdown: state the base unit, the scale multiplier (linear 4-8-12-16 or geometric 4-8-16-32), container max-widths (sm/md/lg/xl breakpoints), grid system (12-col default, or 8-col / 4-col for niche).

### 5.5 Elevation & Depth

Frontmatter (optional — components reference these): shadow tokens by level (`sm`, `md`, `lg`, `xl`).

Markdown: z-index layer convention (e.g. base 0, dropdown 100, modal 1000, toast 10000). Why elevation matters as a token: rebrands often shift from flat to layered; encoding the levels makes the shift mechanical.

### 5.6 Shapes

Frontmatter: `rounded` scale (`sm`, `md`, `lg`, `full`).

Markdown: corner conventions (e.g. "buttons use `md` (8px); cards use `lg` (12px); avatars use `full`"). Why: consistency. Without conventions, every component picks its own radius and the system looks accidental.

### 5.7 Components

Frontmatter `components:` keyspace. Minimum required: `button`, `input`, `card`, `modal`. Each entry references tokens (no raw hex), with size variants (`sm`, `md`, `lg`) and state variants (`default`, `hover`, `active`, `disabled`, `focus`).

Example minimal component entry:

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

Markdown: per-component, document size and state grid (table or bullet list). Don't enumerate every pixel — that's the frontmatter's job.

### 5.8 Do's and Don'ts

5 to 10 rules per side. Cover three categories:

- **Voice & tone** — when to use the accent color, when to stay neutral.
- **Accessibility** — explicit AA/AAA commitment, never-do patterns (no color-only state, no <16px body text, no <44px touch targets).
- **Brand consistency** — list 2-3 lookalikes to avoid drifting toward.

Example Don'ts:

- Don't pair `tertiary` with `warning` — both warm, creates confusion.
- Don't use `body-sm` for primary CTA labels — affordance loss.
- Don't use shadow `xl` outside of modal overlays — devalues hierarchy.

---

## 6. Validation step

Run `npx --yes @google/design.md lint <design_md_path>` after writing.

If lint surfaces findings:

1. **`broken-ref` (error)**: a component references a token that doesn't exist. Fix by either defining the missing token or rewriting the reference. Do NOT inline a hex value as a workaround — that defeats the rebrand mechanic.
2. **`missing-primary` (warning)**: forgot `colors.primary`. Add it.
3. **`contrast-ratio` (warning)**: a component's `backgroundColor`/`textColor` pair fails WCAG AA (4.5:1). Strategy:
   - Adjust the lighter color toward more contrast — but stay on-brand. Don't just darken arbitrarily.
   - If primary/text pairing fails: shift hue, not just lightness (e.g. `#5A6470` → `#3A4450` keeps slate identity, raises contrast).
   - Document the rationale in the Colors section ("we shifted slate from #5A6470 to #3A4450 to meet AA against neutral background").
4. **`orphaned-tokens` (warning)**: defined a color no component uses. Either add a component that references it OR remove the token. Why: orphans bloat the file and confuse rebrand attempts.
5. **`section-order` (warning)**: re-emit sections in canonical order (Overview → Colors → Typography → Layout → Elevation → Shapes → Components → Do's/Don'ts).

If a section is malformed, regenerate ONLY that section. Don't re-roll the whole file unless the linter exits with multiple structural errors.

---

## 7. Output checklist

Before declaring done, verify:

- [ ] YAML frontmatter present with at minimum: `name`, `colors.primary`, `typography.*`, `spacing`, `rounded`, `components` (≥4 entries).
- [ ] 8 prescribed sections in correct order (or documented omissions only when no tokens of that kind exist).
- [ ] `npx @google/design.md lint <path>` exits 0 (or only `info`-severity findings).
- [ ] WCAG AA passes for primary/background and text/background pairs (AA is non-negotiable; AAA per project requirement).
- [ ] File written to `./DESIGN.md` (or the path declared in `.agents/project.yaml` `design_md_path`).
- [ ] Source of inputs documented in Overview (which Constitution/PRD/bundle informed the synthesis).

---

## 8. Bridge-mode notes (Paths C and D)

### From Open Design (Path C)

- The `design-system slug` (e.g. `linear-app-warm-v2`) becomes the Overview anchor: "Inspired by the `linear-app-warm-v2` system iterated in Open Design; adapted for <our context>."
- Token values from the iteration manifest are preserved **exactly**. The LLM authors the prose around them, never overwrites hex values.
- If Open Design output is missing fields the spec expects (e.g. no `success`/`warning`/`error`), the LLM extends with on-brand additions and notes the extension in the Colors section.

### From Claude Design (Path D)

- `tokens.json` values are the source of truth. Write them **verbatim** into the frontmatter.
- The bundle's README hints inform the Overview and Do's/Don'ts prose ONLY; it does NOT override tokens.
- If `tokens.json` ships partial coverage (e.g. only colors and typography, no spacing), the LLM authors the missing scales using the same disciplined defaults from §5.4–5.6.
- Why this discipline: the user paid for Claude Design output. Respect it. The bridge step adds structure (DESIGN.md format) and prose, not opinion.

### Conflict resolution

If bridge inputs violate WCAG AA (e.g. a brand pair from the bundle fails contrast), do NOT silently fix. Surface to the user:

> "The `primary`/`background` pair from your Claude Design bundle (`#5A6470` on `#F0F2F5`) measures 3.2:1 — below AA. Propose nearest on-brand adjustment: `#3A4450` (4.7:1). Accept, reject, or override?"

---

## 9. Iterations — targeted re-roll

If the user is unhappy after generation, support targeted re-rolls without regenerating the whole file. Examples:

- "Re-roll the palette warmer" → regenerate ONLY frontmatter `colors:` + the Colors markdown section. Re-lint after.
- "Change h1 to a serif" → regenerate ONLY `typography.h1` + the relevant Typography prose. Re-lint after.
- "Add a `chip` component" → append to `components:` + add a Components markdown subsection. Re-lint after.

Discipline: keep changes surgical. Why: the user iterated on what's wrong, not what's right. Re-rolling sibling sections wastes their time and risks regressions on parts they liked.

---

## 10. Troubleshooting

### Lint persistently fails with unfamiliar rule names

Schema drift. The cached `assets/design-md-spec-summary.md` is older than the current `@google/design.md` CLI. Fix:

1. Force-refresh: `npx --yes @google/design.md@latest lint <path>`.
2. Re-fetch the spec asset (see asset's §9 "Re-fetch cadence").
3. Re-run.

### Constitution is too vague

Symptom: the LLM produces a generic palette (purple/blue/cyan, Inter, default shadcn). Cause: synthesis didn't have enough signal.

Fix: drop to Q&A (§4 Q&A fallback). 6 questions, ~2 minutes for the user, dramatically better output.

### Bridge tokens conflict with WCAG

See §8 "Conflict resolution". Surface, propose, defer to user — never silently override paid output.

### User says "too corporate" or "too playful" after generation

Likely tone signal mismatch in synthesis. Ask the user to pick 3 adjectives from this list: serious, playful, premium, accessible, warm, cool, technical, friendly. Re-roll palette + typography only (§9 targeted re-roll). Keep everything else.

### Same brand reference keeps surfacing for different projects

The LLM is defaulting. Add an explicit "avoid looking like X" line to the synthesis input next iteration. Why: anti-references constrain the design space more effectively than positive references for AI authoring.

### File written but downstream `/project-bootstrap` doesn't pick it up

Check `.agents/project.yaml` `design_md_path` matches where you wrote the file. Default is `./DESIGN.md`. If the project overrides the path (e.g. `.context/DESIGN.md`), the frontend-setup pre-flight reads from that path.
