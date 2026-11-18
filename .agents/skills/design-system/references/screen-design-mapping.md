# Screen design and master design plan (optional phase)

> Loaded by `/design-system` only after `DESIGN.md` exists (or when re-invoked standalone), and only when the user opts in. The phase turns screen mockups produced by an external tool into a `master-design-plan.md`: per-screen fidelity specs plus a User-Story to Screen map. `/sprint-development` consumes it so every UI story is built against its agreed screen.

## Core principle: delegation, not generation

The AI does not generate screen mockups on its own. Screen design is a design-tool job: a dedicated tool produces the prototypes and they land in the repo. This skill orchestrates the delegation, in one of three modes.

- MCP-driven (preferred when available). Open Design's MCP is registered, so the AI commissions the runs itself (`start_run` per screen). Open Design's own pipeline generates, and the AI polls, checks and exports the results into the drop zone. The flow is autonomous end to end, and the human is pulled in only for early review and taste calls. The principle still holds, because the generator is Open Design's inner agent and skill, never the orchestrating AI hand-writing HTML.
- Manual handoff (fallback). With no MCP, tell the user what to do (brief out), wait, then build the plan from what lands, as Paths C and D do for `DESIGN.md`.
- Design-skill generation (Mode C). With no MCP but the design set loaded for the job before the first line of HTML (`agentic-dev-core/references/skill-composition-strategy.md` §3.5: `frontend-design`, `ui-ux-pro-max`, `impeccable`, `emil-design-eng`, plus the two conditional members it names), the AI writes the screen HTML itself through those skills, and they are what make it a design tool. Name them in `BRIEF.md`; a human ratifies the result like any other mockup. With no design skill loaded this mode does not exist, and the AI falls back to the manual handoff.

Supported external tools (the user picks):

| Tool | How | Output |
|------|-----|--------|
| **Claude Design** (`claude.ai/design`) | Premium (Claude Pro+). User mocks screens in HTML/CSS, exports the handoff bundle. | A bundle (HTML/CSS/JS prototypes + chat transcript) dropped into the drop zone. |
| **Open Design** (OSS, local desktop app; Docker optional) | Free. User iterates screens in the local UI, downloads the prototypes. | Prototype files dropped into the drop zone. |
| Any other prototyper (Figma export, HTML a human wrote, ...) | User's choice | Whatever lands in the drop zone is treated as the screen source, once a human ratifies it. |
| AI-generated HTML through design skills (Mode C) | The design set loaded in the session (`skill-composition-strategy.md` §3.5) | HTML screens the AI writes through it into the drop zone; `BRIEF.md` names the skills loaded; a human ratifies every one. Without a design skill loaded, AI-written HTML is not a mockup (S1). |

Drop zone: `.context/designs/<project-slug>/<batch-slug>/`. The project slug comes from `.agents/project.yaml`, and the batch slug from `references/screen-design-brief.md`. Each brief or feature batch gets one folder holding `BRIEF.md` and the returned bundle.

> Two drop zones carry two different artifacts. `design/handoff/` (repo root) is Path D's zone for the system-level token bundle that becomes `DESIGN.md`. `.context/designs/` is this phase's zone for screen mockups that become `master-design-plan.md` specs. The external tools are the same, the cargo and the consumers differ.

## Always opt-in

The phase needs an explicit user yes, every time. After `DESIGN.md` is generated, or at a standalone invocation, ask and never assume. Suggested prompt (AskUserQuestion):

> `DESIGN.md` is ready. Optionally, map per-screen designs into a `master-design-plan.md` so each user story is built against its exact screen. This needs screen mockups from an external tool (Claude Design / Open Design / any prototyper) in `.context/designs/<project>/`.
> Options: **Yes, I have / will produce mockups** · **No, DESIGN.md tokens are enough** · **Not now**.

- No or Not now: skip. `DESIGN.md` alone governs UI fidelity, and `/sprint-development` degrades gracefully to token-only checks. Record the skip and leave the phase.
- Yes: continue.

With nobody to ask (a worker or a routine), the answer is no. An unattended run never starts this phase (`SKILL.md`, "With nobody at the keyboard").

## Procedure (when opted in)

1. Check the drop zone. Look for mockups under `.context/designs/<project-slug>/`.
2. If it is empty, generate a design brief, then pick the delegation mode. Load `references/screen-design-brief.md` and save `BRIEF.md` either way, since provenance does not depend on the mode. Then:

   Mode A, MCP-driven (preferred). When the Open Design MCP is available, or can be brought up through the deterministic preflight in `references/open-design-app.md` §Preflight, run the autonomous flow of `references/open-design-app.md` §"Autonomous MCP flow: screen mockups end-to-end". Mirror the repo design system as `user:<slug>` if that is not done yet, `create_project` with it attached, and one `start_run` per screen using the per-screen prompt slices (`screen-design-brief.md` §MCP). Then poll, check and export each result into the drop zone yourself. Ping the user with the first screen's previewUrl for an early direction check, and finish the batch autonomously. No pause is needed, and the checkpoints in `progress.md` still record each run (runId and status) for resume.

   Mode B, manual handoff and pause (fallback). No MCP and no way to bring it up:
   - Build a portable brief seeded with the frozen `DESIGN.md` tokens (values inlined), the batch's user stories and their AC-visible behaviors, and per-tool export instructions (Claude Design chat pane, Open Design brief form, any prototyper).
   - Save it as `.context/designs/<project-slug>/<batch-slug>/BRIEF.md` before handing it over, because the §4 specs cite it as provenance. Then print it with the one-line mission: copy it into the tool, design, export into the same folder, return and confirm.
   - Record a `progress.md` checkpoint, `status: started, notes: "brief <batch-slug> delivered, waiting for screen mockups in .context/designs/<slug>/<batch-slug>/"`, so the session is resume-safe (Phase 0 picks it back up). Do not fabricate screens to keep going.
3. Detect and enumerate. Once mockups are present, read them and list the screens (one entry per screen or route) with each screen's purpose and notable components. Dispatch a single subagent for the read and synthesis, since mockups can be large, using the briefing template.
4. Map US to Screen. Read the backlog (`.context/PBI/epics/**/stories/**/story.md` and/or the issue tracker) and map every user story to the screen or screens it renders into. A story can touch several screens, so mark the primary one. A story with no screen (pure backend) gets `—`.
5. Generate `master-design-plan.md` at `.context/design/master-design-plan.md` with the sections below. Mirror them, do not reinvent them, because the numbers match the canonical layout and the cross-references from `/sprint-development` resolve against them.
   - §0 Engagement rule: every UI story cites its screen here before coding (ties to the `/sprint-development` design-fidelity gate).
   - §1 Scorecard: per-screen fidelity status (built, partial, missing), empty at the start.
   - §2 Frozen design contract: a short token summary that points to `DESIGN.md` as the authority. Reference the values, never duplicate them.
   - §4 Screen specs: one section per screen, with the spec drawn from the mockup, a checklist, and provenance (the mockup path in the drop zone and the `BRIEF.md` that requested it, when one exists).
   - §5 Divergence register: deliberate, ratified departures from the mockup, each with its reason.
   - §8 US to Screen map: the table from step 4.
   - §9 Maintenance: how to keep the plan in sync.
6. Confirm before writing. Show the user the screen list and the US to Screen map, and let them review and correct before the file is committed. The user decides.
7. Run it incrementally, just in time. The phase can be re-run, and the user need not design every screen up front: design a feature's screens right before its sprint, then append the new screens to §4 and rows to §8. A re-run upserts and never wipes existing screen specs or ratified divergences. When `/sprint-development` hits a UI story with no §8 row (its input #10 gate), it routes the user here: a new brief for just that screen batch (`references/screen-design-brief.md`), the mockup comes back, this procedure upserts §4 and §8, and development resumes.

## Hand-off

`/sprint-development` reads `.context/design/master-design-plan.md`, when present, as a mandatory input for any UI story. It looks the story up in §8, opens the screen spec in §4 and builds against the mockup plus the `DESIGN.md` tokens. With no plan it falls back to `DESIGN.md`-only fidelity.

## Anti-patterns

- S1. Hand-authoring or inventing screen mockups with no design skill loaded (no `Write` or `write_file` of design HTML outside Mode C). Delegate to the external tool and wait for its artifacts. Commissioning Open Design runs through the MCP is sanctioned delegation (Open Design's pipeline generates, you orchestrate), and so is Mode C, where a loaded `frontend-ui` design skill drives the HTML you write. What stays banned is the orchestrating AI writing the mockup markup itself with no design skill loaded, including "fixing" a run by hand-editing its output (send a refinement run instead). A made-up screen defeats the whole fidelity contract.
- S2. Running this phase without an explicit user opt-in. It is always a question, never a default.
- S3. Duplicating `DESIGN.md` token values into the master design plan. Reference them: the plan owns screens, and `DESIGN.md` owns tokens and components.
- S4. Adding a §8 row for a screen that has no mockup in the drop zone. The map describes designed screens, not aspirational ones, which stay in the backlog until designed.
- S5. Overwriting an existing `master-design-plan.md` wholesale on a re-run. Upsert the screens and preserve the ratified divergences (§5) and the scorecard (§1).
