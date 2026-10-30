# Mode `extract` — DESIGN.md from the live code

> **Mode role**: an EXISTING application already has a visual identity in its code. This mode reads it and writes it down as `DESIGN.md`. It never picks a brand and never designs.
> **Output**: `./DESIGN.md` (or `frontend.design_md_path` from `.agents/project.yaml`). Nothing else.
> **Spec source of truth**: [`../assets/design-md-spec-summary.md`](../assets/design-md-spec-summary.md) for the frontmatter shape, section order and lint rules.

---

## Table of contents

1. [Purpose and boundary](#1-purpose-and-boundary)
2. [Write allowlist](#2-write-allowlist)
3. [Locate the live theme](#3-locate-the-live-theme)
4. [Read the tokens](#4-read-the-tokens)
5. [Assemble DESIGN.md](#5-assemble-designmd)
6. [Existing DESIGN.md](#6-existing-designmd)
7. [Lint and report](#7-lint-and-report)
8. [Hand-offs](#8-hand-offs)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Purpose and boundary

Use this mode when the app was built before agentic-dev arrived (an adopted, brownfield app) and its theme already lives in `tailwind.config.*`, the global stylesheet and `components.json`. The `tokens` mode would make the user pick a catalog brand that contradicts the UI people already use; this mode mirrors what is there instead.

The direction is one way: **code → `DESIGN.md`**. The live theme files stay the implementation; `DESIGN.md` becomes the readable contract every agent consults (Critical Rule #14 then compares a UI change against tokens that match the live UI, not against an invented brand).

What the mode never does:

- Run `npx getdesign`, open a catalog, or suggest a brand. The identity is the app's.
- Invent a token. A value that is not in the code does not go in the file (§4.6).
- "Improve" a value: a low-contrast pair the app ships is reported, not repaired (§7).
- Execute the app's config. Files are read statically; `tailwind.config.*` is TypeScript or JavaScript that is parsed by reading, never imported or run.

## 2. Write allowlist

Read-only on application code. The only paths this mode may write:

| Path | Why |
|---|---|
| `DESIGN.md` (or `frontend.design_md_path`) | the output |
| `DESIGN.<variant>.md` next to it | only when the user accepts a variant (§4.2, §6) |
| `.session/design-system/` | Phase 0 / Phase 1 session state |

Everything else is read: `tailwind.config.*`, every stylesheet, `components.json`, `app/layout.*`, `components/ui/*`, `package.json`. Before closing, `git status --porcelain` must list nothing outside the allowlist; any other path is a defect to revert (that path only, Critical Rule #13) and report.

## 3. Locate the live theme

An app often carries dead copies (a second `globals.css` nobody imports, a leftover `tailwind.config.js` next to the `.ts`). Resolve the LIVE file for each input from evidence, in this order, and record the evidence:

1. **App root.** `stack.app_root` in `.agents/project.yaml` when the project declares that block; otherwise the directory holding `components.json`, else the `package.json` that depends on `tailwindcss`. Several candidates and no declaration → ask.
2. **Tailwind major version.** The installed version in the app's `package.json` (`tailwindcss`) decides the shape: v3 keeps the theme in `tailwind.config.*` and CSS variables in `@layer base`; v4 keeps it in CSS (`@theme` / `@theme inline`) and usually has no config file.
3. **Global stylesheet.** `components.json` → `tailwind.css` names it. Confirm it with the import in the root layout (`app/layout.*`, or `pages/_app.*`). When the two disagree, the file the layout imports is live.
4. **Tailwind config.** `components.json` → `tailwind.config`, else the `tailwind.config.*` the app's tooling resolves (v4 projects may legitimately have none, or name one with `@config` in CSS).
5. **Fonts.** `next/font` calls in the root layout (`Inter({ variable: '--font-inter' })`), the `fontFamily` block of the config, and `--font-*` variables in CSS.
6. **Component vocabulary.** `components.json` (`style`, `baseColor`, `cssVariables`) and the variant definitions in `components/ui/*` (for example a `cva(...)` call in `button.tsx`).

A file found but not live is ignored and listed under "Dead theme files" in the report.

## 4. Read the tokens

### 4.1 Colors

- **CSS variables** in `:root` (or `@theme`) are the palette. Token name = the variable name without `--` (`--primary` → `primary`, `--primary-foreground` → `primary-foreground`, `--chart-1` → `chart-1`).
- **Keep the value's format.** The spec and its linter accept any CSS color (`#hex`, `rgb()`, `hsl()`, `oklch()`) and convert to sRGB only for the contrast check, so the extracted value is copied verbatim. No conversion, no rounding.
- **Bare channel values are not colors.** shadcn on Tailwind v3 stores channels only (`--primary: 270 91% 65%`) and wraps them in the config (`hsl(var(--primary))`). Re-assemble with the wrapper the config uses: `hsl(270 91% 65%)`. The same for `rgb(var(--x) / <alpha-value>)` → `rgb(...)` without the alpha placeholder.
- **Indirections resolve to the literal.** `--color-primary: var(--primary)` in `@theme inline` points at `--primary`; record the literal from `:root`, under the name the components use.
- **Hard-coded config colors** (`colors: { brand: '#0F766E' }` in the config) are tokens too, same name.
- **`primary` is required by the linter.** shadcn apps always have `--primary`. When the app has no variable with that role, ask the user which extracted color plays it, offering only extracted colors. Never pick one silently, never add a new one.

### 4.2 Light, dark, and dark-only apps

`DESIGN.md` describes one theme. The theme the app renders by default (`:root`) goes in `colors`. When a `.dark` (or `[data-theme=dark]`, `@media (prefers-color-scheme: dark)`) block overrides the palette, OFFER a `DESIGN.dark.md` variant built from that block by the same rules; write it only on a yes. A dark-only app (`:root` already dark, `color-scheme: dark`) has one file, and its Overview says so.

### 4.3 Typography

- **Families**: resolve each `--font-*` to the family the layout loads (`--font-inter` → `Inter`). A fallback stack is not a family; keep the first real face.
- **Sizes**: the type scale the code declares (`fontSize` in the config, `--text-*` in `@theme`, explicit sizes in the base layer for `h1`..`h6`/`body`). When the app overrides nothing, the scale is Tailwind's default for the installed major version: record the steps the components actually use (`text-sm`, `text-base`, `text-2xl` found in `components/ui/*` and the layout) with the framework's value, and mark each `# tailwind default` in a YAML comment.
- Weight, line height and letter spacing only where the code sets them.

### 4.4 Rounded and spacing

- **Rounded**: `--radius` is the base; shadcn derives the steps (`--radius-sm: calc(var(--radius) - 4px)`, or `borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)' }` in a v3 config). Compute each step to a plain dimension: the linter rejects `calc(...)` as an invalid dimension (error, not warning). Mixed units resolve against the root font size, the browser's 16px unless the app sets `html { font-size }`: `0.5rem` base → `lg: 0.5rem`, `md: 6px # calc(var(--radius) - 2px), 16px root`. A spec dimension must carry a unit.
- **Spacing**: a custom `spacing` block or `--spacing` base (v4) when present; otherwise the framework default base for the installed major, marked `# tailwind default`.

### 4.5 Components

From `components/ui/*`: for each primitive that exists (button, input, card, badge, dialog...), map the default variant's classes back to tokens (`bg-primary text-primary-foreground rounded-md` → `backgroundColor: "{colors.primary}"`, `textColor: "{colors.primary-foreground}"`, `rounded: "{rounded.md}"`). Only primitives present in the code; only references to tokens extracted above (a `broken-ref` is an extraction bug).

### 4.6 What is absent stays absent

A token kind the code does not define (no elevation scale, no spacing override in a v3 app that only uses defaults you chose not to record) is not filled in. The spec allows omitting a section; omit it and list it under "Discovery Gaps" in the report with what was searched. The user decides later whether that gap becomes a design decision (that is the `tokens` mode, or an ADR), never this mode.

**Provenance on every token.** Each frontmatter value carries a trailing YAML comment naming its source: `primary: "hsl(270 91% 65%)" # app/globals.css :root --primary`. That comment is what makes a later re-run a diff instead of a guess.

## 5. Assemble DESIGN.md

- **Frontmatter**: `version: alpha`, `name` = the app's product name (`package.json` `name` or `project.project_name`), `description` stating it was extracted from the live code, then `colors`, `typography`, `rounded`, `spacing`, `components` per §4.
- **Prose**, in the spec's section order, only sections that have tokens: `## Overview` names the mode (`extract`), the live files read (§3) and the theme shape (light / dark-only / light + variant). `## Colors` groups the roles the app uses (surface, text, brand, state, chart) and quotes each value. The other sections describe what the code shows, not intentions.
- **`## Do's and Don'ts`** carries one line per lint warning the app ships with (§7), so a reader sees the live trade-off instead of a silently "fixed" token.
- No rationale is invented. "Why this violet" is unknown from code; say what the token does, not why someone chose it.

## 6. Existing DESIGN.md

Check the target before writing:

| Target state | Action |
|---|---|
| absent | write it |
| the shipped stub (the `> **Status**: Stub` line) | overwrite it; the stub holds no tokens |
| real content | show a token-level diff (extracted vs current), then ask: **upsert** (replace changed values, add new tokens, keep prose that still applies: D3) / **variant** (`DESIGN.extracted.md` alongside) / **skip** |

A DESIGN.md whose tokens disagree with the live code is drift. The code is what users see, so the default recommendation is upsert, but the call is the user's: a team mid-rebrand may keep the target file on purpose.

## 7. Lint and report

1. `npx --yes @google/design.md lint <path>` must report `errors: 0`. An error (usually `broken-ref`) is an extraction bug: fix the extraction, re-lint.
2. Warnings describe the LIVE app. `contrast-ratio` below AA is a real accessibility finding in production UI: report it with the pair and its source lines, record it in Do's and Don'ts, and do NOT change the token. Fixing it is a UI change with its own story.
3. `git status --porcelain` shows only allowlisted paths (§2).

Report shape (chat, PM Voice headline):

```
DESIGN.md extracted from the live app (<theme shape>), lint errors 0 / warnings <n>.
- sources: <live files with the evidence that made each one live>
- tokens: colors <n> · typography <n> · rounded <n> · spacing <n> · components <n>
- dark variant: written | offered and declined | n/a
- lint warnings: <rule: pair or token, source line> (left as shipped)
- discovery gaps: <kind: what was searched>
- dead theme files: <paths, why not live>
- app files modified: none
```

## 8. Hand-offs

- **Never route to `/project-bootstrap` frontend-setup** after this mode. That phase emits `tailwind.config` / `globals.css` FROM tokens; on an app whose theme files are the source, it would overwrite the live config with its own echo. The extracted file is consumed by reading, not by regeneration.
- **`/sprint-development`** reads it as the token contract for every UI story (Critical Rule #14). The live UI and the extracted tokens agree by construction, so the fidelity check starts from a true baseline.
- **Drift check**: re-run `extract` after a theme change in code. With provenance comments, the run is a value diff (§6 upsert).
- **The screen phase** is unchanged: it reads whatever `DESIGN.md` exists, extracted or not.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Colors lint as invalid | bare channels copied without the config's wrapper | re-assemble per §4.1 |
| `'calc(...)' is not a valid dimension` | a derived radius or spacing step copied as written | compute it per §4.4 and keep the expression in the comment |
| `broken-ref` | a component references a token that was not extracted | extract it, or drop the reference if the class is not a theme token (`bg-white` is a literal utility, not a token) |
| Two stylesheets, different palettes | one is dead | §3.3: the layout's import wins; list the other as dead |
| No theme files at all (plain CSS, no Tailwind, no variables) | nothing to extract | stop and say so; the identity is not in code, so this is the `tokens` mode's job |
| Config computes colors from an imported package | value lives outside the app's files | follow the import read-only inside `node_modules`; unresolved → Discovery Gap, never a guessed value |
