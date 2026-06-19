# Screen design brief generator

> Loaded by `references/screen-design-mapping.md` (step 2) when the drop zone is empty or new
> screens are needed. Produces a **portable design brief** — a self-contained prompt the user
> copies into the external design tool (Claude Design / Open Design / any prototyper) so the
> mockup session starts already aligned with the project's frozen tokens and backlog, instead
> of the user re-explaining the project from scratch.

## Why this exists

The external tool cannot read this repo. Without a brief, the user arrives at `claude.ai/design`
or Open Design empty-handed, improvises context, and the resulting mockup drifts from `DESIGN.md`
before the fidelity contract even starts. The brief closes that gap: it carries the design
contract OUT to the tool, so the bundle that comes BACK is born compliant.

The brief is a **mission**, not a mockup. Generating the brief does NOT violate D7/S1 — the AI
still never produces screens; it produces the instructions the human takes to the tool that does.

## Delegation principle — functional intent, not visual prescription

**The external tool is the design expert, not us.** The brief carries exactly TWO kinds of
specificity and nothing more:

1. **The design-system contract** (tokens from `DESIGN.md`) — the only visual constraint we impose.
2. **Functional intent** (what the user must be able to DO on each screen, drawn from the ACs) —
   expressed as verbs and outcomes, never as widgets or layouts.

Everything else — layout, composition, visual hierarchy, component choice, density, spacing
rhythm, micro-interactions, empty-state personality — is the tool's domain. A brief that dictates
"dropdown top-right, three-column grid, cards with avatars" strangles the tool's creativity and
produces worse design than the tool would on its own. Say "the user filters runs by status and
date", not "add a filter dropdown".

Litmus test per line: *does this sentence describe what the screen must accomplish, or how it
must look?* "How it must look" is only legitimate when it comes from the frozen tokens or from
an AC that literally specifies appearance.

## Brief modes — first vs follow-up (tool project continuity)

Claude Design and Open Design both keep **persistent projects**: every prompt lands in the same
tool-side workspace/chat, so the design AI accumulates context and converges on the design system
after the first screens. Exploit that — do not re-teach what the tool already knows:

| Mode | When | Brief carries |
|------|------|---------------|
| **FULL** | First brief in a new tool project | Everything: product context + full frozen contract (tokens inlined) + screens + export instructions |
| **FOLLOW-UP** | Same tool project, later batch | Mission + new screens (functional intent) + one-line contract reminder ("same design system as the previous screens in this project — `DESIGN.md` tokens still govern") + export instructions. NO re-pasted token block, NO repeated product context. Add: "keep visual consistency with the screens already designed in this project." |

Mechanics:

- Ask the user before generating: "¿Sigues en el mismo proyecto de {tool} o empiezas uno nuevo?"
  Same project → FOLLOW-UP mode.
- Record the mode + tool project name in the BRIEF.md header (`Tool session:` line) so the next
  brief knows continuity exists.
- **Tool memory is convenience, NOT contract.** The repo-side validation never relaxes: every
  returned bundle is still checked against `DESIGN.md` at mapping time (scorecard §1, divergences
  §5). If the tool drifts across iterations, the mapping catches it — that's the safety net that
  makes full delegation safe.
- Bootstrap special case: if `DESIGN.md` does not exist yet and the user wants the tool to *invent*
  the design system on the first mockup session, that is Path D ordering — ingest the first bundle
  into `DESIGN.md` first (`references/claude-design-handoff.md` → Path E), THEN freeze and continue
  with screen briefs against it.

## When to generate

- Screen-mapping phase opted in AND drop zone (`.context/designs/<project-slug>/`) is empty.
- Incremental mode: a UI story reaches `/sprint-development` with no row in §8 of
  `master-design-plan.md` and the user chooses "just-in-time mockup" (see sprint-dev input #10).
- The user explicitly asks: "generate a design brief", "brief de diseño", "prepara el prompt
  para Claude Design / Open Design".

## Inputs (read before generating)

1. `DESIGN.md` frontmatter — the frozen tokens (colors, typography, spacing, radius, shadows).
   **Inline the actual values into the brief** — the external tool can't follow a file reference.
2. Backlog stories needing screens — `.context/PBI/epics/**/stories/**/` (`story.md`,
   `acceptance-criteria.md`) or the issue tracker. Only the stories whose screens are being
   requested in THIS brief, not the whole backlog.
3. `.context/business/business-model.md` / `PRD/executive-summary.md` — for the 1–2 line product
   context. Summarize; never paste whole documents.
4. `.agents/project.yaml` — `<project-slug>` for the drop-zone path.

## Batch folder convention

Each brief targets one **batch** of screens (typically the screens of one feature / sprint
frontier). Destination:

```
.context/designs/<project-slug>/<batch-slug>/
  BRIEF.md          # the generated brief, saved BEFORE handing to the user (traceability)
  ...               # the exported bundle lands here when the user returns
```

`<batch-slug>` = short kebab feature/sprint id (e.g. `settings-batch`, `test-runs-index`).
Saving `BRIEF.md` first is mandatory: it versions WHAT was asked alongside WHAT came back, and
step 3 of the mapping procedure records it as provenance in each §4 screen spec.

## Brief template

Generate the brief with exactly these sections (fill `{...}`; drop a section only if truly empty):

```markdown
# Design brief — {project name} / {batch-slug}
Tool session: {NEW project | CONTINUE project "{tool-project-name}" — mode FOLLOW-UP}

## Mission
Design {N} screen(s) for {product one-liner}. We describe WHAT each screen must accomplish;
HOW it looks is your call — layout, composition, hierarchy, component choices, and
micro-interactions are fully delegated to you. Your only hard boundary is the design
contract below: never invent colors, fonts, or spacing values outside it.
When done, export and return the files as described in "Export & return".

## Product context
{1–2 sentences: what the product does, who uses it, the tone (from business-model/PRD).}
{FOLLOW-UP mode: omit — the project already knows.}

## Frozen design contract (non-negotiable)
{FULL mode — inline the real values:}
- Colors: {inline values from DESIGN.md frontmatter — primary, accent, surface, text, ...}
- Typography: {families + scale}
- Spacing scale: {values}
- Radius / shadows: {values}
- Component conventions: {1 line, e.g. "shadcn-style cards, 1px borders, no glassmorphism"}
{FOLLOW-UP mode — replace the block with one line:}
- Same design system as the previous screens in this project; keep full visual consistency
  with them. The established tokens still govern.

## Screens requested
### 1. {screen-slug} — {human name}
- Route: {/path}
- Purpose: {1 line}
- User stories: {KEY-123 — summary; KEY-124 — summary}
- The user must be able to: {compressed AC bullets — capabilities and outcomes, verbs not
  widgets: "filter runs by status and date", NOT "add a filter dropdown"}
- States the ACs demand: {default / empty / loading / error — only those, with the triggering
  condition, not their appearance}
- Viewport: {desktop-first 1440px / mobile 390px / both}

### 2. {next screen…}

## Hard constraints
- Name each screen file/frame with its `{screen-slug}` exactly — the repo maps files by slug.
- No new tokens. A value not in the frozen contract is a defect, not a creative choice.
- {project-specific FUNCTIONAL constraints only, e.g. accessibility AA, dark-mode variant
  required — never layout/visual prescriptions}

## Export & return
{ONLY the block for the tool the user picked:}

**Claude Design** (`claude.ai/design`): paste this whole brief as your first message in the
chat pane. Iterate until satisfied. Then Export (top-right) → **Save as folder** → place the
bundle contents into `.context/designs/{project-slug}/{batch-slug}/` in the repo.
(If you use "Send to local coding agent", tell the agent the destination path above.)

**Open Design** (local app — see `references/open-design-app.md` to bring it up): create a
project, pick a screen-type skill (e.g. `web-prototype`/`dashboard`), and paste this brief into
the Discover question form / brief field. Iterate, then copy the final artifacts from
`./.od/artifacts/<timestamp>-<slug>/` into `.context/designs/{project-slug}/{batch-slug}/`.

**Any other tool**: produce HTML/CSS (preferred) or high-fidelity images, one file per screen
named by `{screen-slug}`, into the same destination folder.

When the files are in place, come back to the agent session and confirm — the screen-mapping
phase resumes automatically (session checkpoint is waiting).
```

## Procedure

1. Read the inputs (§Inputs). Dispatch a Single subagent if the backlog read is heavy.
2. Determine the batch: which screens, which stories. Confirm the list with the user (one
   AskUserQuestion — they may want to add/remove a screen). In the same question, ask whether
   this continues an existing tool project (→ FOLLOW-UP mode) or starts a new one (→ FULL mode).
3. Fill the template in the chosen mode. Compress ACs to capabilities (verbs, not widgets) per
   §Delegation principle; FULL mode inlines real token values, FOLLOW-UP replaces the contract
   block with the consistency one-liner.
4. Save to `.context/designs/<project-slug>/<batch-slug>/BRIEF.md` (create folders).
5. Print the brief to the user + the one-line mission: "Copy BRIEF.md into {tool}, design,
   export into the same folder, come back and confirm."
6. Write the `progress.md` checkpoint (`status: started`, `notes: "brief <batch-slug> delivered,
   waiting for mockups"`) and PAUSE — same wait contract as Paths C/D.

## Anti-patterns — NEVER do these

- **B1.** NEVER include secrets, credentials, `.env` values, internal URLs, or customer data in
  a brief — it is pasted into an external service.
- **B2.** NEVER paste whole PRD/SRS documents — the brief is a compression, not an attachment.
  Context beyond ~2 lines + AC bullets dilutes the design signal.
- **B3.** NEVER skip saving `BRIEF.md` to the batch folder before handing it over — an unsaved
  brief breaks mockup provenance (§4 specs cite it).
- **B4.** NEVER generate the mockup yourself "while waiting" — D7/S1 stand. Brief out, human
  designs, bundle in.
- **B5.** NEVER write token values in the brief that differ from `DESIGN.md` — the brief is a
  carrier of the frozen contract, not a place to redesign it.
- **B6.** NEVER prescribe layout, composition, component choices, or visual hierarchy in a brief —
  the external tool is the design expert. The brief's only visual specificity is the token
  contract; everything else is functional intent (verbs and outcomes from the ACs). Over-specified
  briefs produce worse mockups than the tool would create freely.
- **B7.** NEVER re-paste the full token contract in a FOLLOW-UP brief for the same tool project —
  the tool's project memory already holds it; redundant contracts add noise and invite
  contradictions. The repo-side mapping validation (§1 scorecard / §5 divergences) remains the
  real enforcement either way.
