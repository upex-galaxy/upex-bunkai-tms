# DESIGN.md spec, condensed reference

> **Source**: `https://github.com/google-labs-code/design.md` (Apache-2.0)
> **Fallback**: `https://stitch.withgoogle.com/docs/design-md/specification`
> **Fetched**: 2026-05-10
> **Schema status**: `alpha` (active development, re-fetch periodically)
> **Audience**: the LLM authoring DESIGN.md from scratch (Path E of `/design-system`).
> This is a reference card, not a tutorial.

---

## 1. Schema version

- The top-level `version` key is optional, and the current value is `"alpha"`.
- Without `version`, downstream tools assume `alpha`. Writing `version: alpha` is cosmetic but recommended, so diff and lint output stays stable when the schema moves.

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

- `primary` is required. The linter raises `missing-primary` (warning) when it is absent.
- Recommended roles (leaving them out risks poor downstream rendering): `secondary`, `tertiary`, `neutral`, `background`, `text`, `border`, `success`, `warning`, `error`.

### Recommended typography roles

- `h1`...`h6`, `body` (or `body-md`, `body-sm`), `caption`, `label`.
- Each value is a Typography object (see §3).

### Spacing scale (convention)

- Keys: `xs`, `sm`, `md`, `lg`, `xl`, `2xl`. Values are dimensions or unitless numbers (bare numbers are read as px).

### Rounded scale (convention)

- Keys: `sm`, `md`, `lg`, `full`. `full` is typically `9999px`, for pills.

### Components

- The keyspace is free-form. Common names: `button`, `input`, `card`, `modal`, `chip`, `nav`.
- Inside each one, use token references such as `{colors.primary}`, `{rounded.md}`, `{spacing.md}`.

---

## 3. Token value types

| Type                | Form             | Example                                    |
| ------------------- | ---------------- | ------------------------------------------ |
| **Color**           | any CSS color    | `"#1A1C1E"`, `"oklch(0.205 0 0)"`          |
| **Dimension**       | number + unit    | `48px`, `1rem`, `0.5em`, `-0.02em`         |
| **Token Reference** | curly-brace path | `{colors.primary}`, `{typography.body-md}` |
| **Typography**      | object           | see below                                  |

### Typography object, full shape

```yaml
fontFamily: <string> # required
fontSize: <Dimension> # required
fontWeight: <number | string> # optional (e.g., 400, 700, "bold")
lineHeight: <Dimension | number>
letterSpacing: <Dimension> # e.g., "-0.02em"
fontFeature: <string> # OpenType features, e.g., "ss01"
fontVariation: <string> # variable-font axes
```

All these fields exist because downstream exporters (Tailwind, DTCG) map each one to a CSS or token property. An omitted field falls back to the browser or exporter default.

---

## 4. Section order (prescribed, omittable, not reorderable)

Sections use `##` headings. The lint rule `section-order` warns on a reorder.

1. **Overview** (alias: `Brand & Style`)
2. **Colors**
3. **Typography**
4. **Layout** (alias: `Layout & Spacing`)
5. **Elevation & Depth** (alias: `Elevation`)
6. **Shapes**
7. **Components**
8. **Do's and Don'ts**

The order matters because downstream agents and humans read sequentially: Overview frames the intent before the tokens land, and Components references everything above it. A reorder breaks that context.

Any section may be omitted when the frontmatter has no tokens of that kind. The `missing-sections` lint rule (info severity) flags optional sections that are absent while tokens exist.

---

## 5. Verbatim example, "Heritage" (from the Google Labs README)

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

Use this example as the structural template when generating a new system. Its brevity is intentional: a DESIGN.md is meant to be scannable.

---

## 6. Lint rules (`npx @google/design.md lint`)

The linter runs the rules below at fixed severities. Run it after every generation.

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

How to act on each severity:

- `error`: fix it before shipping (the command exits non-zero).
- `warning`: fix it unless there is an explicit justification.
- `info`: advisory, safe to ignore.

`contrast-ratio` is a warning and not an error because a brand can require off-spec pairs (for example warning-on-warning). The linter surfaces the pair and the author decides. Document any deliberate AA bypass in the Do's and Don'ts section.

---

## 7. Export targets (`npx @google/design.md export`)

| Target          | Output                                                            | Use case                                                 |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `json-tailwind` | JSON `theme.extend` config for Tailwind v3                        | Inject into `tailwind.config.js`                         |
| `css-tailwind`  | CSS `@theme { ... }` block with custom properties for Tailwind v4 | Drop into `globals.css`                                  |
| `dtcg`          | W3C Design Tokens Community Group format JSON                     | Hand off to Figma / Style Dictionary / any DTCG consumer |

The three targets cover the two dominant Tailwind versions plus the cross-tool industry standard. The `/project-bootstrap` skill consumes `json-tailwind` or `css-tailwind` depending on the project's Tailwind version.

---

## 8. Authoring discipline (the five non-negotiables)

1. **Frontmatter is the source of truth.** The Markdown body explains and the tokens decide.
2. **Never invent token paths.** `{colors.foo}` must resolve to a defined token.
3. **Colors are CSS colors, authored in hex.** The spec accepts any CSS color format, and the linter converts to sRGB only for the contrast check, keeping the original for export. Authored paths (B-E) write hex for readability. The `extract` mode copies the live format verbatim (`oklch()`, `hsl()`) so the file matches the code. `calc(...)` is not a valid dimension: compute it.
4. **Dimensions carry units.** Write `8px`, not `8`. The spacing scale accepts bare numbers, but prefer units for clarity.
5. **Component tokens reference, they don't redefine.** A button's `backgroundColor` should be `{colors.primary}`, not `"#1A1C1E"`, otherwise a rebrand breaks it.

---

## 9. Re-fetch cadence

The schema is `alpha`. Re-fetch `https://raw.githubusercontent.com/google-labs-code/design.md/main/README.md` quarterly, or when `npx @google/design.md lint` surfaces unfamiliar rules. Update this asset in place and do not branch into versioned files (one canonical reference per topic, the skill-creator convention).
