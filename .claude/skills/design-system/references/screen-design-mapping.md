# Screen design & master design plan (OPTIONAL phase)

> Loaded by `/design-system` only after `DESIGN.md` exists (or when re-invoked standalone),
> and only when the user opts in. This phase turns **screen mockups produced by an external
> tool** into a `master-design-plan.md` — per-screen fidelity specs + a User-Story→Screen map —
> that `/sprint-development` consumes so every UI story is built against its agreed screen.

## Core principle — delegation, not generation

The AI does **NOT** generate screen mockups. Screen design is an inherently external maneuver:
the user produces prototypes in a dedicated tool and downloads them into the repo. This skill
**orchestrates the handoff** (tell the user what to do, wait, then build the plan from what lands)
— exactly like Paths C / D already do for `DESIGN.md`.

Supported external tools (document both; the user picks):

| Tool | How | Output |
|------|-----|--------|
| **Claude Design** (`claude.ai/design`) | Premium (Claude Pro+). User mocks screens in HTML/CSS, exports the handoff bundle. | A bundle (HTML/CSS/JS prototypes + chat transcript) dropped into the drop zone. |
| **Open Design** (OSS, local Docker app) | Free. User iterates screens in the local UI, downloads the prototypes. | Prototype files dropped into the drop zone. |
| Any other prototyper (Figma export, hand-authored HTML, …) | User's choice | Whatever lands in the drop zone is treated as the screen source. |

**Drop zone:** `.context/designs/<project-slug>/<batch-slug>/` (project-slug from `.agents/project.yaml`;
batch-slug per `references/screen-design-brief.md` — one folder per brief/feature batch, holding
`BRIEF.md` + the returned bundle).

> **Two drop zones, two artifacts — do not confuse them.**
> `design/handoff/` (repo root) is Path D's zone for the **system-level token bundle** that becomes
> `DESIGN.md`. `.context/designs/` is THIS phase's zone for **screen mockups** that become
> `master-design-plan.md` specs. Same external tools, different cargo, different consumers.

## Always opt-in — never auto-run

This phase is **gated on an explicit user yes, every time**. After `DESIGN.md` is generated (or at
standalone invocation), ALWAYS ask — never assume. Suggested prompt (AskUserQuestion):

> `DESIGN.md` is ready. Optionally, map per-screen designs into a `master-design-plan.md` so each
> user story is built against its exact screen. This needs screen mockups from an external tool
> (Claude Design / Open Design / any prototyper) in `.context/designs/<project>/`.
> Options: **Yes — I have / will produce mockups** · **No — DESIGN.md tokens are enough** · **Not now**.

- **No / Not now** → skip. `DESIGN.md` alone governs UI fidelity; `/sprint-development` degrades
  gracefully to token-only checks. Record the skip and exit the phase cleanly.
- **Yes** → continue.

## Procedure (when opted in)

1. **Check the drop zone.** Look for mockups under `.context/designs/<project-slug>/`.
2. **If empty → generate a design brief, delegate + PAUSE.** Do NOT print generic "go design"
   instructions — load `references/screen-design-brief.md` and follow its procedure:
   - Build a portable brief seeded with the `DESIGN.md` frozen tokens (inlined values), the
     batch's user stories + AC-visible behaviors, and per-tool export instructions
     (Claude Design chat pane / Open Design brief form / any prototyper).
   - Save it as `.context/designs/<project-slug>/<batch-slug>/BRIEF.md` BEFORE handing it over
     (provenance — §4 specs cite it), then print it with the one-line mission: copy into the
     tool, design, export into the same folder, return and confirm.
   - Record a `progress.md` checkpoint `status: started, notes: "brief <batch-slug> delivered,
     waiting for screen mockups in .context/designs/<slug>/<batch-slug>/"` so the session is
     resume-safe (Phase 0 picks it back up). Do NOT fabricate screens to keep going.
3. **Detect + enumerate.** Once mockups are present, read them and list the screens (one entry per
   screen/route), capturing each screen's purpose and notable components. Dispatch a Single subagent
   for the read+synthesis (mockups can be large) per the briefing template.
4. **Map US → Screen.** Read the backlog (`.context/PBI/epics/**/stories/**/story.md` and/or the
   issue tracker) and map every user story to the screen(s) it renders into. A story can touch
   several screens; mark the primary one. Stories with no screen (pure backend) are noted as `—`.
5. **Generate `master-design-plan.md`** at `.context/design/master-design-plan.md` with these
   sections (mirror, do not reinvent):
   - **§0 Engagement rule** — every UI story cites its screen here before coding (ties to the
     `/sprint-development` design-fidelity gate).
   - **§1 Scorecard** — per-screen fidelity status (built / partial / missing) — start empty.
   - **§2 Frozen design contract** — a short token summary that points to `DESIGN.md` as the
     authority (never duplicate token values; reference them).
   - **§4 Screen specs** — one section per screen: the spec drawn from the mockup + a checklist
     + provenance (mockup path in the drop zone + the `BRIEF.md` that requested it, when one exists).
   - **§5 Divergence register** — deliberate departures from the mockup, ratified, with reason.
   - **§8 US→Screen map** — the table from step 4.
   - **§9 Maintenance** — how to keep it in sync.
   (Section numbers match the canonical layout so cross-references from `/sprint-development` resolve.)
6. **Confirm before write.** Show the user the screen list + the US→Screen map and let them review
   and correct before committing the file. Always let the user decide.
7. **Incremental / just-in-time.** This phase is re-runnable. The user need not design every screen
   upfront — design a feature's screens right before its sprint and append the new screens to §4 +
   rows to §8. Re-invocation UPSERTs; never wipe existing screen specs or ratified divergences.
   When `/sprint-development` hits a UI story with no §8 row (its input #10 gate), it routes the
   user here: a new brief for just that screen batch (`references/screen-design-brief.md`),
   mockup comes back, this procedure UPSERTs §4 + §8, dev resumes.

## Hand-off

`/sprint-development` reads `.context/design/master-design-plan.md` (when present) as a mandatory
input for any UI story: it looks up the story in §8, opens the screen spec in §4, and builds against
the mockup + `DESIGN.md` tokens. If the plan is absent, it falls back to `DESIGN.md`-only fidelity.

## Anti-patterns — NEVER do these

- **S1.** NEVER generate or invent screen mockups. Delegate to the external tool and wait for the
  artifacts. A made-up screen defeats the entire fidelity contract.
- **S2.** NEVER run this phase without an explicit user opt-in. It is always a question, never a default.
- **S3.** NEVER duplicate `DESIGN.md` token values into the master design plan — reference them. The
  plan owns *screens*; `DESIGN.md` owns *tokens/components*.
- **S4.** NEVER add a §8 row for a screen that has no mockup in the drop zone — the map describes
  designed screens, not aspirational ones (those stay in the backlog until designed).
- **S5.** NEVER overwrite an existing `master-design-plan.md` wholesale on re-run — UPSERT screens and
  preserve ratified divergences (§5) and the scorecard (§1).
