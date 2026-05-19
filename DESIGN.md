# DESIGN.md — Bunkai

> **Status**: Authored (LLM-authored custom path — option 5 from `/design-system`). Source mockup at `.context/designs/bunkai-test-management-tool/`.
> **Spec**: Google Labs DESIGN.md format (https://github.com/google-labs-code/design.md).
> **Source**: tokens extracted from the Claude Design handoff CSS (`.context/designs/bunkai-test-management-tool/project/styles.css`). Iteration cycle: regenerate this file whenever the mockup is updated or rebranding occurs.

---

## 1. Brand identity

**Product name**: Bunkai (分解).
**Wordmark**: kanji 分解 + Latin "Bunkai" set side-by-side. The kanji uses Noto Serif JP weight 700; Latin uses Inter weight 700 with tight tracking.
**Defensive domain**: `bankai.io` (anime-confusion redirect).
**Mandatory brand clarification**: "Bunkai is the real Japanese martial-arts term — not the anime word." Surface in onboarding, the footer, and any time the brand is introduced.
**Pronunciation**: BOON-kai. The "u" sounds like "book", not "bank".
**Tone**: precise, dense, developer-first, opinionated about quality. Inspired-by — not cloning — Linear (density), VS Code (layout), GitHub (palette restraint), Vercel Dashboard (typographic discipline). The single warm accent — vermillion — is a nod to the hanko stamp imagery that surrounds the kanji.

## 2. Design principles

1. **Information density first.** QAs manage hundreds of ATCs daily. Spacing exists to clarify, not to relax. Default to "cómodo" only behind an explicit toggle.
2. **Dark mode is the canonical theme.** Light mode follows in Phase 2. Designers must think in `--bg-0` first; light is a secondary mode, not the source.
3. **Monospace where IDs live, sans-serif where prose lives.** IDs (`ATC-001`, `RUN-451`, `MOD-014`) always render in JetBrains Mono. Free-form content uses Inter.
4. **Status carries color; nothing else does.** Pass/fail/block/skipped/running are the only globally-meaningful color tokens. Accent is reserved for primary actions and focus rings.
5. **Sharp radii, low elevation.** Border-radius peaks at 10px; shadows are subtle. Visual register is "engineer's terminal", not "consumer app".

## 3. Color tokens (canonical)

### 3.1 Surfaces

| Token | Hex | Role |
|---|---|---|
| `--bg-0` | `#0a0b0d` | Page background — deepest layer |
| `--bg-1` | `#101216` | Sidebar / chrome |
| `--bg-2` | `#14171c` | Surface panels (default card) |
| `--bg-3` | `#1a1e25` | Elevated card / focused input |
| `--bg-4` | `#232830` | Hover state |
| `--bg-5` | `#2d333c` | Active / pressed state |

### 3.2 Foreground (text tiers)

| Token | Hex | Role |
|---|---|---|
| `--fg-0` | `#f1f3f5` | Strongest text (titles, primary action) |
| `--fg-1` | `#d4d8de` | Default body text |
| `--fg-2` | `#9aa1ab` | Secondary text |
| `--fg-3` | `#6b727c` | Tertiary / muted |
| `--fg-4` | `#4a5057` | Disabled / placeholder |

### 3.3 Strokes

| Token | Value | Role |
|---|---|---|
| `--stroke-1` | `rgba(255,255,255,0.05)` | Dividers |
| `--stroke-2` | `rgba(255,255,255,0.08)` | Default border |
| `--stroke-3` | `rgba(255,255,255,0.13)` | Hover border |
| `--stroke-strong` | `rgba(255,255,255,0.22)` | High-contrast border (focused state) |

### 3.4 Accent (vermillion — used sparingly)

| Token | Hex | Role |
|---|---|---|
| `--accent` | `#d9543f` | Primary actions, focus ring, progress fill |
| `--accent-hi` | `#e87060` | Hover state of accent |
| `--accent-glow` | `rgba(217,84,63,0.18)` | Focus glow, selection |
| `--accent-soft` | `rgba(217,84,63,0.10)` | Pressed background, tag highlight |

### 3.5 Signal palette (status)

| Token | Hex | Background | Role |
|---|---|---|---|
| `--pass` | `#2fb673` | `rgba(47,182,115,0.10)` | Passing tests / steps |
| `--fail` | `#e5484d` | `rgba(229,72,77,0.10)` | Failing tests / steps |
| `--blocked` | `#e8a838` | `rgba(232,168,56,0.10)` | Blocked steps |
| `--skipped` | `#8a91a0` | `rgba(138,145,160,0.08)` | Not run / skipped |
| `--running` | `#4f8cf7` | `rgba(79,140,247,0.10)` | Run in progress |

### 3.6 Layer palette (ATC layer chips)

| Token | Hex | Layer |
|---|---|---|
| `--layer-ui` | `#8b6df0` | UI layer |
| `--layer-api` | `#4f8cf7` | API layer |
| `--layer-unit` | `#2fb673` | Unit layer |

## 4. Typography

| Variable | Font | Use case |
|---|---|---|
| `--font-sans` | Inter, ui-sans-serif, system-ui | Default UI text, body |
| `--font-mono` | JetBrains Mono, ui-monospace, "SF Mono", Menlo | IDs, code, ATC steps, terminals |
| `--font-jp` | Noto Serif JP, serif | Kanji wordmark only |

Base font size: **13px**. Body line-height: **1.45**. Feature settings enabled: `cv11`, `ss01` (Inter stylistic alternates for tighter `i`/`l` and number forms).

### Type ramp

| Size | Use |
|---|---|
| 10.5px (uppercase, letter-spacing 0.04em) | Field labels |
| 11px / 11.5px (mono or sans, weight 500) | Tags, chips, small buttons, kbd |
| 12px / 12.5px (sans, weight 400–500) | Buttons, inputs, table cells |
| 13px (sans, weight 400) | Body text |
| 14–16px (sans, weight 600) | Section headings |
| 18–22px (sans, weight 700) | Page titles |

## 5. Spacing & geometry

### Radii

| Token | Value | Use |
|---|---|---|
| `--r-1` | 3px | Chips, kbd, tags |
| `--r-2` | 5px | Buttons, inputs |
| `--r-3` | 7px | Cards |
| `--r-4` | 10px | Modals, large surfaces |

### Spacing scale

Bunkai uses an implicit 4-px grid. Common gaps: 4, 6, 8, 10, 12, 16, 20, 24. Padding around primary surfaces tops out at 16; nothing breathes more than 24.

### Shadows

| Token | Use |
|---|---|
| `--shadow-pop` | `0 12px 28px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset` — modals, popovers |
| `--shadow-card` | `0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.4)` — default cards |

## 6. Component vocabulary

| Component | Notes |
|---|---|
| **Button** (`.btn`) | Variants: default, `data-variant="primary"` (vermillion fill), `data-variant="ghost"` (transparent), `data-variant="danger"` (outlined red). Sizes: `sm`, default, `lg`, `icon-only`. |
| **Chip** (`.chip`) | Status chip — `data-status="pass|fail|blocked|skipped|running"`. Layer chip — `data-layer="UI|API|Unit"`. |
| **Dot** (`.dot`) | Tiny status indicator used in the tree view and run lists. `running` dot pulses. |
| **Kbd** (`.kbd`) | Keyboard shortcut hint with a 1px-thicker bottom border to mimic physical keys. |
| **Tag** (`.tag`) | Removable input chip (monospace) with an `x` close icon. |
| **Input / Textarea / Select** (`.input`, `.textarea`, `.select`) | Solid background `--bg-2`, hover bumps to `--stroke-3`, focus to accent border + `--bg-3`. Mono variant available. |
| **Card** (`.card`) | Default surface, used for ATC view, dashboard cards, settings panels. |
| **Segmented control** (`.seg`) | Used for view-toggle (Tree / Table / Mind-map), layer selection. `aria-pressed="true"` for active. |
| **Progress bar** (`.bar`) | 4-px height with rounded fill. Multi-segment variant (`.bar.seg-bar`) for status breakdown bars. |
| **Caret** (`.caret`) | Animated terminal-style cursor for empty states and CLI hints. |
| **Tree** | Indented list with `📁` / `📄` glyphs (or Lucide icons), status dot, right-click context menu, drag-to-move support. |
| **Tabs** (VS-Code-style) | Used in the main editor area to switch between open entities (ATC, Test, Run). |
| **Command palette** | Modal triggered by `Cmd/Ctrl+K`. Used for global navigation + primary actions. |

## 7. Iconography

- **Library**: Lucide icons (`lucide-react`) — clean line-weight, consistent stroke width.
- **Sizing**: 14px default for inline, 16px for navigation items, 18px for empty states.
- **Color**: inherits `currentColor`, defaulting to `--fg-2`. Active / accent icons use `--accent` or `--fg-0`.
- **No emoji in production UI** except the file-tree glyphs in mockups (those will be replaced by Lucide `Folder` / `FileText` in implementation).

## 8. Motion

- **Default transition**: 120ms ease for color, background, border-color, transform. Used on `.btn`, `.chip`, `.input`.
- **Progress bar fill**: 200ms ease for `width`.
- **Status pulse** (`.dot[data-status="running"]`): 1.6s ease-in-out infinite — subtle, single accent (blue glow).
- **Caret blink**: 1s steps(2) — terminal-style.
- **No page transitions**. Navigation must feel instantaneous (no fades > 80ms on route changes).

## 9. Theming approach (Tailwind + shadcn integration)

- All color tokens above are exposed as CSS custom properties on `:root`.
- Tailwind config maps these to semantic names (`bg-surface-0` → `var(--bg-0)`, `text-secondary` → `var(--fg-2)`, `border-default` → `var(--stroke-2)`, etc.). Generated config to live at `tailwind.config.ts`.
- shadcn/ui components are themed via the same CSS variables (shadcn's `.dark` block matches the canonical dark theme above).
- Light theme (Phase 2): inverted surfaces (`--bg-0` → near-white), inverted foregrounds, same accent and status palette (lightly desaturated where contrast needs it).

## 10. Accessibility

- **Contrast**: text on surfaces meets WCAG AA at all default token combinations (verified: `--fg-1` on `--bg-0` ≈ 12.5:1, `--fg-2` on `--bg-0` ≈ 7:1, accent `#d9543f` on `--bg-0` ≈ 5.1:1).
- **Focus**: every interactive element shows `:focus-visible` as a 1px solid `--accent` outline with 1px offset. Never remove without replacement.
- **Keyboard-first**: every primary action has a keyboard path, surfaced through the command palette. Modal/dialog focus traps required.
- **Color is never the sole signal**: status dots are paired with text (e.g. "Pass", "Fail") and icons in dense views.
- **Reduced motion**: respect `prefers-reduced-motion` — disable caret blink and dot pulse.

## 11. Source files

| File | Purpose |
|---|---|
| `.context/designs/bunkai-test-management-tool/project/styles.css` | Canonical CSS variables + atom styles |
| `.context/designs/bunkai-test-management-tool/project/Bunkai.html` | Five-screen mockup entry point |
| `.context/designs/bunkai-test-management-tool/project/screens/*.jsx` | React-prototype implementations of each screen (login, home, project, editor, run) |
| `.context/designs/bunkai-test-management-tool/project/icons.jsx` | Icon set used in the mockup |
| `.context/designs/bunkai-test-management-tool/chats/chat1.md` | Original Claude Design conversation transcript — read for intent |

## 12. Regeneration triggers

Re-run `/design-system` or hand-edit this file when:

- A new brand color (e.g. secondary accent) is introduced.
- The light theme lands in Phase 2 (DESIGN.md gains a light-token table).
- Logo treatment is finalized (currently wordmark-only).
- Component vocabulary expands materially (e.g. mind-map view tokens for nodes / edges land Phase 2).
- A rebranding occurs.

---

**Related files**: `README.md`, `CLAUDE.md`, `CONTEXT.md`, `.context/designs/`.
