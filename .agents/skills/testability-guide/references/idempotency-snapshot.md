# Idempotency snapshot

> The snapshot makes a re-run of `/testability-guide` safe and fast: an identical stack is a no-op, and drift gets a surgical patch only.
>
> Read it in Phase 2 of `SKILL.md` on every re-run. Phase 4 also writes the snapshot at the top of the generated page.

---

## Snapshot format

The snapshot is one multi-line comment at the very top of the generated page file. Its format is framework-agnostic and is adapted to the host's comment syntax when written (`/* … */` in TSX, `<!-- … -->` in `.astro` markup, and so on).

Example (TSX / Next.js):

```tsx
/* qa-guide-snapshot
   skill-version=1.1.0
   stack=next-15.5.4
   ui-kit=shadcn
   icons=lucide-react
   auth-method=supabase-token+bearer+x-api-key   // DETECTED — never a default path
   docs-ui=redoc                                  // DETECTED — scalar | redoc | swagger | none
   docs-route=/api-docu                           // DETECTED route
   openapi-spec=/api/openapi                      // DETECTED — never assume .json
   db=supabase-postgres
   orm=none
   repos-shape=poly                               // mono | poly
   mcp-config-files=mcp.json,opencode.jsonc       // which agent configs exist
   page-features=shiki,request-cards,playwright-cli  // Q6/Q7/Q8 page-craft choices (see below)
   language=es
   publisher=jira-epic
   credentials-source=https://upex.atlassian.net/browse/UPEX-321
   default-branch=staging
   build-sha-source=VERCEL_GIT_COMMIT_SHA            // env var NAME(S), never the SHA value
   testability=UI:weak API:deficient DB:ok           // from testability-assessment.md
   generated=2026-05-28
   content-hash=sha256:8a2f7c…                        // or `sha256:… external-maintained` when human-owned
*/
```

---

## Fields (canonical list)

| Field                | Source                                          | Drift triggers…                                                                                                  |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `skill-version`      | this skill's own version                        | A major bump means a full re-scaffold. A minor bump is a no-op unless other fields drifted.                      |
| `stack`              | pre-flight detection (framework + version)      | §5 (API testing code), §6 (Playwright code), routing file location.                                              |
| `ui-kit`             | pre-flight detection                            | All component-rendering sections (re-emit Buttons / Cards / Accordions / Tabs using the new kit).               |
| `icons`              | pre-flight detection                            | Icon import lines only.                                                                                          |
| `auth-method`        | pre-flight detection                            | §5 AuthMethods tabs (login curl, header name, body shape) and the §6 Playwright login fixture. A detected list, never a default path. |
| `docs-ui`            | pre-flight detection                            | §5 docs link renderer label (scalar/redoc/swagger).                                                              |
| `docs-route`         | pre-flight detection                            | §5 docs link href.                                                                                              |
| `db`                 | `stack.database` + pre-flight detection         | §4 (the DB MCP that `mcp-and-env-setup.md` §4.0 picked, its connection template and the VSCode URI scheme).      |
| `orm`                | pre-flight detection                            | Architecture table label only. No code drift.                                                                    |
| `repos-shape`        | `.agents/project.yaml` (`backend_repo`/`frontend_repo`) | §2 architecture diagram Repos block (mono one row vs poly two rows).                                     |
| `mcp-config-files`   | pre-flight detection                            | Which agent tabs render in §3 to §6 (claude/opencode/codex/gemini).                                                 |
| `page-features`      | Q6 / Q7 / Q8 (detection-pre-answered)           | Comma-separated page-craft flags (e.g. `shiki,request-cards,playwright-cli`). A missing or older flag set on a re-run signals a flat-page upgrade opportunity (see "page-features upgrade" below). It never triggers a patch by itself; the skill offers the upgrade. |
| `language`           | Q5 / pre-flight i18n signal                     | All visible copy. Code identifiers untouched.                                                                    |
| `publisher`          | Q1                                              | Credentials CTA href + button copy.                                                                              |
| `credentials-source` | publish step (Phase 6)                          | Credentials CTA href.                                                                                            |
| `openapi-spec`       | pre-flight detection                            | §5 OpenAPI MCP `OPENAPI_SPEC_PATH` (full URL: origin plus detected route) and the docs UI link. Never assume `.json`. |
| `default-branch`     | pre-flight `git` detection                      | `/git-flow-master` base branch for the patch PR.                                                                 |
| `build-sha-source`   | pre-flight detection (deployed build SHA source) | Hero build stamp (`qaConfig.build.shaEnvVars`). Comma-separated env var names, or `none`. See "Build stamp is runtime-only" below. |
| `generated`          | wall-clock at write time                        | Audit field. It does not trigger a patch.                                                                        |
| `testability`        | `testability-assessment.md` (Phase 1)           | Audit field: a compact per-layer score, for example `UI:weak API:deficient DB:ok`. A re-run compares it to report "testability improved / regressed". It does not trigger a page patch by itself. |
| `content-hash`       | sha256 of the rendered credentials-content body, OR `external-maintained` (see below) | Drift in the credentials artifact triggers a re-publish, and a page re-render only if the page also drifted. |

---

## Build stamp is runtime-only (excluded from drift and hash)

The `/qa` hero shows the deployed commit SHA (`page-craft.md`, Build stamp), and that value changes on every deploy. It never enters anything this file diffs or hashes:

- The page source holds env var names (`qaConfig.build.shaEnvVars`); the value is read at runtime.
- The snapshot records only `build-sha-source` (the names). Drift on that field means the platform or variable changed, never that a new commit shipped.
- `content-hash` covers the credentials-content body, which never carries the SHA.

So a redeploy reads as a no-op on the next run. A snapshot from before this field existed has no `build-sha-source`: treat it as drift on that field alone and patch only the hero stamp.

---

## content-hash when the artifact is human-maintained (`external-maintained`)

The two-pass hash below assumes the skill renders the artifact body. The usual steady state is different: after the first publish, a human fills real secrets into the gated destination (`security-rules.md`, artifact-side rules). There is then no skill-rendered "body before passwords" to hash on a re-run, and the publisher's non-destructive rule forbids overwriting the human-curated body (`publishers/jira-epic.md`, Update flow).

Handle it this way:

- When a re-run leaves the artifact human-owned (the user picked "leave untouched"), set `content-hash` to the sha256 of the current live destination body, as a drift anchor, and mark the field human-owned with the suffix ` external-maintained`, for example `content-hash=sha256:9e9feb… external-maintained`.
- A re-run that sees the `external-maintained` marker never renders and overwrites the body. It re-hashes the live body. The same hash is a no-op. A different hash is reported as "artifact changed externally" (a rotation or an edit) and the anchor is updated, still without overwriting.
- Drop the marker only when the user explicitly takes skill ownership of the body again (a full re-publish with their consent).
- With nobody at the keyboard, "leave untouched" is the answer: keep the marker, update the anchor, report the change.

---

## `page-features`: the flat-page upgrade signal

`page-features=` records the Q6, Q7 and Q8 page-craft choices baked into the current page. The field is optional: a page generated by an older skill version, from before the page-craft questions existed, does not have it.

Recognized flags (extend the list as the skill adds page-craft capabilities):

| Flag             | Means                                                          | Owning question |
| ---------------- | ------------------------------------------------------------- | --------------- |
| `shiki`          | Server-side syntax highlighting (or host-equivalent) is wired. | Q6              |
| `plain-pre`      | Code blocks are plain `<pre>`, no highlighter.                | Q6              |
| `request-cards`  | §5 auth renders Postman-style RequestCards (Visual/curl toggle). | Q8           |
| `curl-blocks`    | §5 auth renders plain highlighted curl blocks.                 | Q8              |
| `playwright-cli` | §6(b) agentic driver is the `playwright-cli` binary.          | Q7              |
| `playwright-mcp` | §6(b) agentic driver is the Playwright MCP.                    | Q7              |

Upgrade detection on a re-run:

- No `page-features` field (an older flat page): the page predates page-craft. The skill reports the upgrade opportunity: _"This `/qa` predates server-highlight + request-cards + playwright-cli. Want me to upgrade it? (regenerates §5 + §6 + adds the highlight pipeline; preserves your detected config + hand-edits)"_. It offers and does not apply. If the user declines, write the page's current flags into the field so the next run does not ask again.
- `page-features` present but lower-fidelity than detection's default (for example the snapshot says `plain-pre,curl-blocks,playwright-mcp` and Q6 to Q8 detection would now default to `shiki,request-cards,playwright-cli`): the same offer, scoped to the differing flags.
- `page-features` matches detection: no page-craft drift, so these flags are a no-op.

A `page-features` change is an opt-in upgrade and never a forced patch, because it changes how the page looks, not whether it is correct. Respect the user's choice and persist it. With nobody at the keyboard, the answer is "decline": write the current flags into the field, report the offer, and change nothing.

---

## Diff procedure (Phase 2 of SKILL.md)

1. Read the page file at the resolved route (Q3 or detected). If no file exists, it is a fresh scaffold: skip the rest of this section.
2. Parse the snapshot comment. If it is absent, treat the page as legacy or hand-edited and ask the user before overwriting.
3. Re-run `pre-flight-discovery.md` against the current repo state.
4. Build a fresh field map.
5. Diff fresh vs snapshot. Categorize:
   - No-op: only `generated` or `skill-version` drifted (and the version drift is minor).
   - Surgical patch: one or more code-affecting fields drifted (`stack`, `ui-kit`, `auth-method`, `docs-ui`, `docs-route`, `db`, `repos-shape`, `mcp-config-files`, `language`, `openapi-spec`, `build-sha-source`).
   - Re-publish only: `publisher` or `credentials-source` drifted, code-affecting fields unchanged.
   - Page-features upgrade (an offer, never automatic): `page-features` is absent or lower-fidelity than detection's default. Surface the offer (see "page-features upgrade" above) and apply it only on user opt-in.
   - Full re-scaffold: a `skill-version` major bump, or three or more code-affecting fields drifted at once (the project was probably rewritten, so ask first).
6. Report the diff to the user before applying anything. Surgical patch is the default, and the user can opt for a full re-scaffold instead.

With nobody at the keyboard, a no-op, a surgical patch and a re-publish-only outcome run (the patch lands in a pull request, so it is reversible; the re-publish follows the outward-write rule in `decision-questions.md` Q1). A full re-scaffold or an absent snapshot over a hand-edited page stops after the diff report, because the overwrite needs a person's consent.

---

## Two-pass content-hash (write the snapshot twice on a fresh scaffold)

`content-hash` is computed against the rendered credentials-content body, after the `.agents/project.yaml` substitution and before real passwords. On a fresh scaffold the body does not exist yet when the page file is first written, so the hash has to be written in two passes.

Write the snapshot twice in the same run:

Pass 1, page codegen (Phase 4):

Write the snapshot with `content-hash=sha256:pending-post-publish` (a literal placeholder). Every other field is known at this point.

```
/* qa-guide-snapshot
   …
   content-hash=sha256:pending-post-publish
   …
*/
```

The page file lands on disk during Phase 4 with an obvious placeholder on purpose. `verification-checklist.md` step 7 catches the placeholder and forces Pass 2.

Pass 2, after publish (end of Phase 6):

Once the credentials-content body has been built (Phase 5) and published (Phase 6):

1. Compute `sha256(rendered-body)` over the body before password substitution (passwords stay as `<see secrets store>` placeholders, so they are not part of the hash input). Hash the exact string the publish step sent over the wire, without any per-destination wrapper conversion.
2. Patch the page file in place: replace `content-hash=sha256:pending-post-publish` with `content-hash=sha256:<actual-hex>`.
3. Re-stage the page file in git, so the commit captures the final hash.

Pass 2 also runs on a re-publish-only outcome (publisher changed, page code unchanged). The hash input is the rendered body, not the page, so a re-publish always updates the hash.

If the run aborts between Pass 1 and Pass 2 (the publish failed, or the user cancelled), the placeholder stays in the file. The next re-run detects `content-hash=sha256:pending-post-publish` and treats it as "Pass 1 incomplete, resume from Phase 5", not as drift.

## Surgical patch rules

When the diff says surgical patch, regenerate only the sections whose driving fields drifted. Every other section stays byte-identical, which preserves any hand-edits the user made between runs.

| Drifted field                      | Sections to regenerate                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `stack`                            | routing file location, §5 and §6 code blocks, and the architecture-table stack label.            |
| `ui-kit`                           | every component import + JSX primitive (Button, Card, Accordion, Tabs).                          |
| `icons`                            | icon imports only.                                                                               |
| `auth-method`                      | §5 AuthMethods tabs (API curl, JWT vs cookie vs X-API-Key, body shape) and the §6 Playwright login fixture. |
| `docs-ui` / `docs-route`           | §5 docs link (renderer label + href).                                                            |
| `db`                               | §4 (DBHub connection template, smoke-test query and the VSCode URI scheme).                       |
| `repos-shape`                      | §2 architecture diagram Repos block (mono or poly).                                               |
| `mcp-config-files`                 | which agent tabs render across §3 to §6 (claude/opencode/codex/gemini).                             |
| `page-features` (upgrade, opt-in)  | the differing flags only: `shiki` adds the `_lib/highlight` and `_lib/prepare` pipeline and re-emits the code blocks; `request-cards` moves §5 auth from curl-blocks to RequestCards; `playwright-cli` moves §6(b) and the ArchDiagram UI badge from MCP to CLI. Applied only on user opt-in. |
| `language`                         | visible copy only. Code identifiers, `data-testid`s, snapshot fields untouched.                  |
| `publisher` / `credentials-source` | credentials CTA `href` + button copy. Re-publish the artifact via the new channel adapter.       |
| `openapi-spec`                     | §5 OpenAPI MCP `OPENAPI_SPEC_PATH` + docs UI link.                                               |
| `build-sha-source`                 | hero build stamp only (`qaConfig.build` + the `qa-build-sha` node).                             |

After the patch, recompute `content-hash`, update `generated` and write the updated snapshot comment.

---

## Hand-edit policy

Some users hand-edit the page between runs (for example to add a custom section). The skill keeps those edits:

- The orchestrator never touches sections outside the snapshot-driven set above.
- Custom-marked regions (`{/* qa-guide:user-region:start */}` … `{/* qa-guide:user-region:end */}`) are preserved as they are across surgical patches.
- If a custom region sits inside a section the patch wants to regenerate, the orchestrator surfaces the conflict to the user before writing. With nobody at the keyboard it skips that section, patches the rest and reports the skipped section.

---

## When the snapshot is missing or corrupt

- Missing comment: assume the page is hand-authored. Ask the user: `Existing /qa page has no snapshot. Treat as legacy + take over? (yes regenerates with a snapshot; no aborts)`. With nobody at the keyboard, answer "no": change nothing and report it.
- Corrupt comment (an unparseable field): the same prompt and the same unattended answer as a missing one.
- Snapshot exists but the file it points to is missing: regenerate from scratch.

---

## Exit reports

| Outcome                             | Report shape                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fresh scaffold                      | `Created /qa with snapshot { stack, ui-kit, …, generated }. Credentials artifact published to <URL>.`                       |
| Surgical patch                      | `Patched /qa. Sections regenerated: [list]. Drifted fields: [list]. Credentials artifact: <re-published / unchanged>.`      |
| No-op                               | `/qa is up to date with the current stack snapshot. Nothing to do.`                                                         |
| Re-publish only                     | `Page unchanged. Credentials artifact re-published to <new URL>.`                                                           |
| Full re-scaffold (with user opt-in) | `Re-scaffolded /qa. Backed up previous page to .context/legacy/qa-page-<timestamp>.tsx. Credentials artifact re-published.` |
