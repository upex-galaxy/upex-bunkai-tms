# Screen design brief generator

> Loaded by `references/screen-design-mapping.md` (step 2) when the drop zone is empty or new
> screens are needed. Produces a **portable design brief**: a self-contained prompt the user
> copies into the external design tool (Claude Design, Open Design or any prototyper), so the
> mockup session starts already aligned with the project's frozen tokens and backlog instead
> of the user re-explaining the project from scratch.

## Why this exists

The external tool cannot read this repo. Without a brief, the user arrives at `claude.ai/design`
or Open Design empty-handed, improvises context, and the mockup drifts from `DESIGN.md`
before the fidelity contract even starts. The brief carries the design contract out to the
tool, so the bundle that comes back is born compliant.

The brief is a mission, not a mockup. Generating it does not violate D7/S1: the AI still never
produces screens. It writes the instructions the human takes to the tool that does.

## Delegation principle: functional intent, not visual prescription

The external tool is the design expert, not us. The brief carries two kinds of specificity and
nothing more:

1. The design-system contract (tokens from `DESIGN.md`), the only visual constraint we impose.
2. Functional intent (what the user must be able to do on each screen, drawn from the ACs),
   written as verbs and outcomes and never as widgets or layouts.

Everything else belongs to the tool: layout, composition, visual hierarchy, component choice,
density, spacing rhythm, micro-interactions, empty-state personality. A brief that dictates
"dropdown top-right, three-column grid, cards with avatars" strangles the tool and produces
worse design than it would on its own. Say "the user filters runs by status and date", not
"add a filter dropdown".

Test each line by asking whether it describes what the screen must accomplish or how it must
look. "How it must look" is legitimate only when it comes from the frozen tokens or from an AC
that literally specifies appearance.

## Brief modes: first and follow-up (tool project continuity)

Claude Design and Open Design both keep persistent projects. Every prompt lands in the same
tool-side workspace, so the design AI accumulates context and converges on the design system
after the first screens. Use that, and do not re-teach what the tool already knows:

| Mode | When | Brief carries |
|------|------|---------------|
| **FULL** | First brief in a new tool project | Everything: product context, the full frozen contract (tokens inlined), screens and export instructions |
| **FOLLOW-UP** | Same tool project, later batch | Mission, new screens (functional intent), one line reminding the contract ("same design system as the previous screens in this project, `DESIGN.md` tokens still govern") and export instructions. No re-pasted token block and no repeated product context. Add: "keep visual consistency with the screens already designed in this project." |

Mechanics:

- Before generating, ask the user whether they are continuing in the same tool project or
  starting a new one (in the user's language). Same project means FOLLOW-UP mode. With nobody at
  the keyboard, read the previous `BRIEF.md` header (`Tool session:` line): when it names a
  project for the same tool, use FOLLOW-UP, otherwise FULL. FULL is the safe default because it
  only costs a longer brief.
- Continuity does not cross tools. FOLLOW-UP assumes the same tool project holds the token
  memory. If the earlier screens came from a different tool (batch 1 in Claude Design, batch 2
  in Open Design), the new tool knows nothing. Keep the FOLLOW-UP framing for the consistency
  language ("match the existing screens") but inline the full frozen contract again (B7 does not
  apply across tools). With Open Design, attach the repo design system as a `user:<slug>`
  package (see `open-design-app.md` §repo → OD) instead of pasting tokens into the brief. The
  package beats prose.
- Record the mode and the tool project name in the BRIEF.md header (`Tool session:` line) so
  the next brief knows continuity exists.
- Tool memory is a convenience, not the contract. Repo-side validation never relaxes: every
  returned bundle is still checked against `DESIGN.md` at mapping time (scorecard §1,
  divergences §5). If the tool drifts across iterations, the mapping catches it, and that safety
  net is what makes full delegation safe.
- Bootstrap special case: if `DESIGN.md` does not exist yet and the user wants the tool to
  invent the design system on the first mockup session, that is Path D ordering. Ingest the
  first bundle into `DESIGN.md` first (`references/claude-design-handoff.md` → Path E), then
  freeze it and continue with screen briefs against it.

## When to generate

- The screen-mapping phase is opted in and the drop zone (`.context/designs/<project-slug>/`) is empty.
- Incremental mode: a UI story reaches `/sprint-development` with no row in §8 of
  `master-design-plan.md` and the user chooses "just-in-time mockup" (see sprint-dev input #10).
- The user explicitly asks for a design brief, in English or Spanish ("generate a design brief",
  "brief de diseño", "prepara el prompt para Claude Design / Open Design").

## Inputs (read before generating)

1. `DESIGN.md` frontmatter: the frozen tokens (colors, typography, spacing, radius, shadows).
   Inline the actual values into the brief, since the external tool cannot follow a file reference.
2. The backlog stories needing screens: `.context/PBI/epics/**/stories/**/` (`story.md`,
   `acceptance-criteria.md`) or the issue tracker. Take only the stories whose screens this
   brief requests, not the whole backlog.
3. `.context/business/business-model.md` and `PRD/executive-summary.md`, for the one or two lines
   of product context. Summarize and never paste whole documents.
4. `.agents/project.yaml`, for the `<project-slug>` of the drop-zone path.

## Batch folder convention

Each brief targets one batch of screens (typically the screens of one feature or sprint
frontier). Destination:

```
.context/designs/<project-slug>/<batch-slug>/
  BRIEF.md          # the generated brief, saved BEFORE handing to the user (traceability)
  ...               # the exported bundle lands here when the user returns
```

`<batch-slug>` is a short kebab-case feature or sprint id (for example `settings-batch`,
`test-runs-index`). Save `BRIEF.md` first: it versions what was asked next to what came back,
and step 3 of the mapping procedure records it as provenance in each §4 screen spec.

## Brief template

Generate the brief with exactly these sections (fill `{...}`, and drop a section only if it is truly empty):

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
project, pick the `frontend-design` skill (application screens), and paste this brief into
the Discover question form / brief field. Iterate, then copy the final artifacts from
`./.od/artifacts/<timestamp>-<slug>/` into `.context/designs/{project-slug}/{batch-slug}/`.

**Any other tool**: produce HTML/CSS (preferred) or high-fidelity images, one file per screen
named by `{screen-slug}`, into the same destination folder.

When the files are in place, come back to the agent session and confirm — the screen-mapping
phase resumes automatically (session checkpoint is waiting).
```

## MCP consumption: per-screen prompt slices (Mode A)

When the delegation runs through MCP (`screen-design-mapping.md` step 2 Mode A), no human pastes
the brief anywhere. The orchestrating AI slices it into one `start_run` prompt per screen.
`BRIEF.md` is still saved whole (provenance, and the batch's single source of truth), and the
slices derive from it and never diverge from it.

Each per-screen prompt has this anatomy, in this order, all in the product's artifact language:

1. Mission line: "Screen N of M for this project: {human name}" plus a one-line product register
   (from §Product context). The numbering gives the tool's project memory a sense of series.
2. Design-system reminder: one short paragraph saying the project has the `user:<slug>` design
   system attached, to use its native token names ({3-4 exemplar names}), and to add no new
   tokens. Do not re-paste the token tables, since the attached package carries them.
3. File contract: the exact `{screen-slug}.html`, self-contained, with the target viewport. The
   slug is what lets the repo map file to §4 spec later, so treat it as an API.
4. Functional intent: the screen's capability bullets from §Screens requested, in the same
   spirit (verbs and outcomes, never widgets).
5. States: the AC-demanded states. On screens 2 and later add "consistent with the states
   treatment you used on screen 1" so the batch stays coherent.
6. Hard constraints: the brief's Hard constraints block, compressed, plus the standing rules
   learned on earlier screens (see below).

Standing rules and drift control:

- UI copy language is a hard constraint, not an assumption. The inner design agent mirrors the
  language of the orchestration conversation, so if you orchestrate in Spanish, screen copy can
  come out Spanish even with an English prompt. State "UI copy in {product language}" in every
  prompt. On the first violation, send a translate-only refinement run and have it persist the
  rule tool-side (Open Design accepts `rule-proposal` cards that auto-verify on later runs).
- Screens 2 and later cite screen 1: "reuse the shell anatomy of `{screen-1-slug}.html`, with
  {section} active". That is why runs are sequential and never parallel.
- Refinements are runs, not edits. A defect in a generated screen (wrong language, missing
  state, off-contract value) is fixed by a follow-up `start_run` describing the correction. The
  orchestrator never edits the HTML (S1).

## Procedure

1. Read the inputs (§Inputs). Dispatch a Single subagent if the backlog read is heavy.
2. Determine the batch: which screens, which stories. Confirm the list with the user in one
   AskUserQuestion, since they may want to add or remove a screen. In the same question, ask
   whether this continues an existing tool project (FOLLOW-UP mode) or starts a new one (FULL
   mode). With nobody at the keyboard, take the batch from the brief or the sprint frontier
   named in it, choose the mode as described under Brief modes, and report both choices.
3. Fill the template in the chosen mode. Compress ACs to capabilities (verbs, not widgets) per
   §Delegation principle. FULL mode inlines real token values, and FOLLOW-UP replaces the
   contract block with the consistency one-liner.
4. Save to `.context/designs/<project-slug>/<batch-slug>/BRIEF.md` (create the folders).
5. Print the brief to the user with the one-line mission: "Copy BRIEF.md into {tool}, design,
   export into the same folder, come back and confirm."
6. Write the `progress.md` checkpoint (`status: started`, `notes: "brief <batch-slug> delivered,
   waiting for mockups"`) and pause, with the same wait contract as Paths C and D. A routine
   that cannot wait ends here: the checkpoint and the saved `BRIEF.md` are the hand-off, and
   the report says the mockups are pending.

## Anti-patterns

- **B1.** Keep secrets, credentials, `.env` values, internal URLs and customer data out of a
  brief, because it is pasted into an external service.
- **B2.** Do not paste whole PRD/SRS documents. The brief is a compression, not an attachment,
  and context beyond about 2 lines plus the AC bullets dilutes the design signal.
- **B3.** Save `BRIEF.md` to the batch folder before handing it over. An unsaved brief breaks
  mockup provenance (§4 specs cite it).
- **B4.** Do not generate the mockup yourself "while waiting". D7/S1 stand: brief out, human
  designs, bundle in.
- **B5.** Write no token value in the brief that differs from `DESIGN.md`. The brief carries the
  frozen contract and is not the place to redesign it.
- **B6.** Do not prescribe layout, composition, component choices or visual hierarchy. The
  external tool is the design expert, and the brief's only visual specificity is the token
  contract. Everything else is functional intent (verbs and outcomes from the ACs), because an
  over-specified brief produces worse mockups than the tool would create freely.
- **B7.** Do not re-paste the full token contract in a FOLLOW-UP brief for the same tool project.
  The tool's project memory already holds it, and a redundant contract adds noise and invites
  contradictions. The repo-side mapping validation (§1 scorecard, §5 divergences) is the real
  enforcement either way.
