# Comment Section

_Started 2026-05-11 21:46 UTC_

---

## User



## Assistant

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: update_todos]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: show_html]_

_[tool: done]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Built the Bunkai MVP — 5 connected screens, dark-first, dense, IDE-feel.

**Aesthetic decisions** (committed up front, no design system in play matched the brief):
- Inter for UI, JetBrains Mono for IDs/code, Noto Serif JP for the kanji
- Backgrounds: very dark warm-neutral (#0a0b0d → #1a1e25), sharp 3–7px radii, 1px hairline strokes
- Single accent: vermillion #d9543f — a nod to the 分解 kanji / hanko stamp — used sparingly for primary actions, the selected-row rail, and the active step
- Signal palette: green/red/amber/graphite + blue for "running"
- Layer chips colour-coded: UI violet, API blue, Unit green

**Screens**
1. **Login** — editorial 分解 split-screen, GitHub/Google auth, expandable self-host card
2. **Workspace home** — KPIs, recent projects table, activity feed with per-kind glyphs, active runs with segmented progress bars
3. **Project view** — VS Code-style tree with right-click context menu, multi-tab right panel, full ATC detail (story → AC → steps → assertions → used-by). Plus working **Table** and **Mind map** views.
4. **ATC editor** — form ↔ live preview, autocomplete user-story search, AC chip selector, drag-handle steps, tag/assertion inputs
5. **Manual run** — distraction-free step card, P/F/B verdict buttons with keyboard hints, outline rail with step glyphs, segmented progress, and a bug drawer pre-filled from the active step

A floating **Screens** switcher (bottom-right) lets you jump between all 5.

## User

Verifier agent check completed

## Assistant

_[tool: list_files]_

_[tool: update_todos]_

_[tool: list_files]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

Let me fix issue 1 — recent projects row:

_[tool: grep]_

_[tool: read_file]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: update_todos]_

_[tool: done]_

_[tool: fork_verifier_agent]_

All verifier issues addressed:
- **Home rows** — added `minmax(0,...)` columns, nowrap+ellipsis on name and metadata.
- **Project breadcrumb** — dropped a segment + already had nowrap/ellipsis per item.
- **Tabs** — `whitespace: nowrap` + `flexShrink: 0` per tab; horizontal scroll on overflow.
- **"Last run failed" strip** — `flex-wrap` with the assertion+button grouped, ellipsis cap on the assertion text.
- **Login kanji** — `clamp(120px, 18vw, 196px)`.
- **Floating panel** — defaults to the collapsed "Screens" pill.

## User

Verifier agent check completed

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Both remaining issues fixed: ATC ID `whitespace: nowrap` (project + editor), and the run screen now uses flex-wrap for the topbar (centered info wraps gracefully) with the sub-step rows collapsing the reserved "now" column to auto width.

## User

Apply comment

## Assistant

_[tool: read_file]_

_[tool: str_replace_edit]_

Done. Three changes:
- **Letter-spacing** went from `-0.05em` (which was crunching the two kanji into each other) to `+0.04em` so 分 and 解 always sit cleanly side-by-side.
- **No-wrap** on the kanji block — they can never break apart vertically.
- **Caption** now uses `flex-wrap: wrap-reverse` — when there's room it sits to the right at the kanji's baseline; when the column gets narrow, it flows **above** the kanji (preserving the kanji as the visual anchor).

## User

ATC NO significa realmente Atomic Test Components, es Acceptance Test Case, es el nombre terminologia del rubro y de la estrategia general IQL

IQL: Integrated Quality Lifecycle, es el termino global de la metodologia QA profesional.
 y KATA: Komponent Action Test Architecture es el verdadero termino global de la arquitectura de los ATCs que se juntan para formar un verdadero Test automatizado.

Corrige ese defecto de contenido en cualquier parte que se mencione mal.

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: grep]_

Listo. Cambios aplicados en la pantalla de login (los únicos lugares con descripciones incorrectas):

- **Hero**: "executable, reusable ATCs" → **"executable Acceptance Test Cases"**
- **Subtítulo**: ahora menciona explícitamente "Built around the **IQL** methodology and the **KATA** architecture"
- **Lista de siglas**: ampliada a las tres oficiales:
  - **IQL** — Integrated Quality Lifecycle (story → case → run → bug)
  - **ATC** — Acceptance Test Case (una conducta observable, ejecutable por humanos o agentes)
  - **KATA** — Komponent Action Test Architecture (cómo los ATCs se ensamblan en un test automatizado real)

La etimología del kanji (分解 = decomponer una *kata* en sus aplicaciones reales) ahora cae con doble sentido — la práctica marcial *y* la sigla técnica.

Los usos de "ATC" como sustantivo en el resto del producto (ATC Library, ATC-CHK-079, "New ATC", "Edit ATC", etc.) ya son correctos: la sigla siempre se refiere a Acceptance Test Case.

