# DESIGN.md spec — condensed reference

> **Source**: `https://github.com/google-labs-code/design.md` (Apache-2.0)
> **Fallback**: `https://stitch.withgoogle.com/docs/design-md/specification`
> **Fetched**: 2026-05-10
> **Schema status**: `alpha` (active development — re-fetch periodically)
> **Audience**: the LLM authoring DESIGN.md from scratch (Path E of `/design-system`).
> **Do not pedagogize** — this is a reference card, not a tutorial.

---

## 1. Schema version

- Top-level `version` key is **optional**; current canonical value is `"alpha"`.
- Omit `version` and downstream tools assume `alpha`. Why: writing `version: alpha` is cosmetic but recommended for future-proofing diff/lint output.

---

## 2. Frontmatter shape (verbatim from Google Labs)

```yaml
version: <string> # optional, current: "alpha"
name: <string> # required — human-readable system name
description: <string> # optional — one-liner pitch
colors:
  <token-name>: <Color>
typography:
  <token-name>: <Typography>
rounded:
  <scale-level>: <Dimension>
spacing:
  <scale-level>: <Dimension | number>
components:
  <component-name>:
    <token-name>: <string | token reference>
```

### Required color roles (lint flags absence)

- `primary` — REQUIRED. The linter raises `missing-primary` (warning) if absent.
- Recommended roles (omit at risk of poor downstream rendering): `secondary`, `tertiary`, `neutral`, `background`, `text`, `border`, `success`, `warning`, `error`.

### Recommended typography roles

- `h1`...`h6`, `body` (or `body-md`, `body-sm`), `caption`, `label`.
- Each value is a Typography object (see §3).

### Spacing scale (convention)

- Keys: `xs`, `sm`, `md`, `lg`, `xl`, `2xl`. Values are dimensions or unitless numbers (interpreted as px when bare).

### Rounded scale (convention)

- Keys: `sm`, `md`, `lg`, `full`. `full` typically `9999px` for pills.

### Components

- Free-form keyspace. Common: `button`, `input`, `card`, `modal`, `chip`, `nav`.
- Inside each: token references like `{colors.primary}`, `{rounded.md}`, `{spacing.md}`.

---

## 3. Token value types

| Type                | Form             | Example                                    |
| ------------------- | ---------------- | ------------------------------------------ |
| **Color**           | hex sRGB string  | `"#1A1C1E"`                                |
| **Dimension**       | number + unit    | `48px`, `1rem`, `0.5em`, `-0.02em`         |
| **Token Reference** | curly-brace path | `{colors.primary}`, `{typography.body-md}` |
| **Typography**      | object           | see below                                  |

### Typography object — full shape

```yaml
fontFamily: <string> # required
fontSize: <Dimension> # required
fontWeight: <number | string> # optional (e.g., 400, 700, "bold")
lineHeight: <Dimension | number>
letterSpacing: <Dimension> # e.g., "-0.02em"
fontFeature: <string> # OpenType features, e.g., "ss01"
fontVariation: <string> # variable-font axes
```

Why all fields exist: downstream exporters (Tailwind, DTCG) map each to a CSS / token property. Omitted fields default to browser/exporter defaults.

---

## 4. Section order (prescribed, omittable, NOT reorderable)

Sections use `##` headings. The lint rule `section-order` warns on reorder.

1. **Overview** (alias: `Brand & Style`)
2. **Colors**
3. **Typography**
4. **Layout** (alias: `Layout & Spacing`)
5. **Elevation & Depth** (alias: `Elevation`)
6. **Shapes**
7. **Components**
8. **Do's and Don'ts**

**Why order matters**: downstream agents and humans read sequentially — Overview frames intent before tokens land; Components reference everything above. Reordering breaks contextual reasoning.

**Omission rule**: any section may be omitted IF no tokens of that kind exist in the frontmatter. The `missing-sections` lint rule (info severity) flags optional sections absent when tokens exist.

---

## 5. Verbatim example — "Heritage" (from Google Labs README)

```md
---
name: Heritage
colors:
  primary: '#1A1C1E'
  secondary: '#6C7278'
  tertiary: '#B8422E'
  neutral: '#F7F5F2'
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 0.75rem
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
---

## Overview

Architectural Minimalism meets Journalistic Gravitas. The UI evokes a
premium matte finish — a high-end broadsheet or contemporary gallery.

## Colors

The palette is rooted in high-contrast neutrals and a single accent color.

- **Primary (#1A1C1E):** Deep ink for headlines and core text.
- **Secondary (#6C7278):** Sophisticated slate for borders, captions, metadata.
- **Tertiary (#B8422E):** "Boston Clay" — the sole driver for interaction.
- **Neutral (#F7F5F2):** Warm limestone foundation, softer than pure white.
```

Use this example as the structural template when generating new systems. The brevity is intentional — DESIGN.md is meant to be scannable.

---

## 6. Lint rules (`npx @google/design.md lint`)

The linter executes seven rules at fixed severity. Always run after generation.

| Rule                 | Severity | Purpose                                                             |
| -------------------- | -------- | ------------------------------------------------------------------- |
| `broken-ref`         | error    | Token references (`{colors.primary}`) that don't resolve            |
| `missing-primary`    | warning  | Colors defined but no `primary` color exists                        |
| `contrast-ratio`     | warning  | Component `backgroundColor`/`textColor` pairs below WCAG AA (4.5:1) |
| `orphaned-tokens`    | warning  | Color tokens defined but never referenced by component              |
| `missing-typography` | warning  | Colors defined but no typography tokens exist                       |
| `section-order`      | warning  | Sections out of canonical order                                     |
| `missing-sections`   | info     | Optional sections absent when tokens exist                          |
| `token-summary`      | info     | Summary of token counts per section                                 |

**Operational rules**:

- `error` severity → must fix before shipping (exit non-zero).
- `warning` severity → fix unless explicitly justified.
- `info` severity → advisory; safe to ignore.

**Why contrast-ratio is a warning, not an error**: brand can require off-spec pairs (e.g., warning-on-warning). The linter surfaces, the author decides. Document any deliberate AA bypass in the Do's and Don'ts section.

---

## 7. Export targets (`npx @google/design.md export`)

| Target          | Output                                                            | Use case                                                 |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `json-tailwind` | JSON `theme.extend` config for Tailwind v3                        | Inject into `tailwind.config.js`                         |
| `css-tailwind`  | CSS `@theme { ... }` block with custom properties for Tailwind v4 | Drop into `globals.css`                                  |
| `dtcg`          | W3C Design Tokens Community Group format JSON                     | Hand off to Figma / Style Dictionary / any DTCG consumer |

Why three targets: covers the two dominant Tailwind versions plus the cross-tool industry standard. The `/project-bootstrap` skill consumes `json-tailwind` or `css-tailwind` depending on the project's Tailwind version.

---

## 8. Authoring discipline (the five non-negotiables)

1. **Frontmatter is the source of truth**. Markdown body explains; tokens decide.
2. **Never invent token paths**. `{colors.foo}` must resolve to a defined token.
3. **Hex values in sRGB only**. No `rgb()`, no `hsl()`, no `oklch()` (yet — spec is alpha).
4. **Dimensions carry units**. `8px`, not `8`. Exception: spacing scale accepts bare numbers, but prefer units for clarity.
5. **Component tokens reference, don't redefine**. A button's `backgroundColor` should be `{colors.primary}`, not `"#1A1C1E"` — otherwise rebrand breaks.

---

## 9. Re-fetch cadence

Schema is `alpha`. Re-fetch `https://raw.githubusercontent.com/google-labs-code/design.md/main/README.md` quarterly or when `npx @google/design.md lint` surfaces unfamiliar rules. Update this asset in-place; do NOT branch into versioned files (skill-creator convention: one canonical reference per topic).
