# Idempotency Snapshot

> **Purpose**: Make re-runs of `/testability-guide` safe and fast. Identical stack → no-op. Drift → surgical patch only.
>
> **When to read**: Phase 2 of `SKILL.md` (every re-run). Phase 4 also writes the snapshot at the top of the generated page.

---

## Snapshot format

A single multi-line comment at the very top of the generated page file. Format is framework-agnostic markdown-style comment — adapted to the host's comment syntax during write (`/* … */` in TSX, `<!-- … -->` in `.astro` markup, etc.).

**Example (TSX / Next.js)**:

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
   language=es
   publisher=jira-epic
   credentials-source=https://upex.atlassian.net/browse/UPEX-321
   default-branch=staging
   testability=UI:weak API:deficient DB:ok           // from testability-assessment.md
   generated=2026-05-28
   content-hash=sha256:8a2f7c…                        // or `sha256:… external-maintained` when human-owned
*/
```

---

## Fields (canonical list)

| Field                | Source                                          | Drift triggers…                                                                                                  |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `skill-version`      | this skill's own version                        | Major bump → full re-scaffold. Minor → no-op unless other fields drifted.                                        |
| `stack`              | pre-flight detection (framework + version)      | §5 (API testing code), §6 (Playwright code), routing file location.                                              |
| `ui-kit`             | pre-flight detection                            | All component-rendering sections (re-emit Buttons / Cards / Accordions / Tabs using the new kit).               |
| `icons`              | pre-flight detection                            | Icon import lines only.                                                                                          |
| `auth-method`        | pre-flight detection                            | §5 AuthMethods tabs (login curl, header name, body shape) + §6 Playwright login fixture. DETECTED list, never a default path. |
| `docs-ui`            | pre-flight detection                            | §5 docs link renderer label (scalar/redoc/swagger).                                                              |
| `docs-route`         | pre-flight detection                            | §5 docs link href.                                                                                              |
| `db`                 | pre-flight detection                            | §4 (DBHub connection template + the VSCode URI scheme).                                                          |
| `orm`                | pre-flight detection                            | Architecture table label only. No code drift.                                                                    |
| `repos-shape`        | `.agents/project.yaml` (`backend_repo`/`frontend_repo`) | §2 architecture diagram Repos block (mono one row vs poly two rows).                                     |
| `mcp-config-files`   | pre-flight detection                            | Which agent tabs render in §3–§6 (claude/opencode/codex/gemini).                                                 |
| `language`           | Q5 / pre-flight i18n signal                     | All visible copy. Code identifiers untouched.                                                                    |
| `publisher`          | Q1                                              | Credentials CTA href + button copy.                                                                              |
| `credentials-source` | publish step (Phase 6)                          | Credentials CTA href.                                                                                            |
| `openapi-spec`       | pre-flight detection                            | §5 OpenAPI MCP `OPENAPI_SPEC_PATH` + docs UI link. DETECTED route, never assume `.json`.                         |
| `default-branch`     | pre-flight `git` detection                      | `/git-flow-master` base branch for the patch PR.                                                                 |
| `generated`          | wall-clock at write time                        | Audit field. Does NOT trigger patch.                                                                             |
| `testability`        | `testability-assessment.md` (Phase 1)           | Audit field — compact per-layer score, e.g. `UI:weak API:deficient DB:ok`. A re-run compares it to report "testability improved / regressed". Does NOT trigger a page patch by itself. |
| `content-hash`       | sha256 of the rendered credentials-content body, OR `external-maintained` (see below) | Drift in the credentials artifact triggers a re-publish (but NOT a page re-render unless the page also drifted). |

---

## content-hash when the artifact is human-maintained (`external-maintained`)

The two-pass hash below assumes the SKILL renders the artifact body. But the common steady state is different: after the first publish, a human fills REAL secrets into the gated destination (`security-rules.md` §artifact-side), so there is no skill-rendered "body before passwords" to hash on re-runs — and the publisher's non-destructive rule means the skill must NOT overwrite that human-curated body (`publishers/jira-epic.md` §Update flow).

Handle it explicitly:

- When a re-run leaves the artifact **human-owned** (user picked "leave untouched"), set `content-hash` to the **sha256 of the CURRENT live destination body** (a drift anchor), and additionally mark the field human-owned by suffixing ` external-maintained` — e.g. `content-hash=sha256:9e9feb… external-maintained`.
- A re-run that sees the `external-maintained` marker MUST NOT attempt a skill-render-and-overwrite. It re-hashes the live body: same hash → no-op; different hash → report "artifact changed externally" (rotation/edit) and update the anchor, but still do NOT overwrite.
- Only drop the marker if the user explicitly re-takes skill ownership of the body (full re-publish with their consent).

---

## Diff procedure (Phase 2 of SKILL.md)

1. Read the page file at the resolved route (Q3 or detected). If no file exists → fresh scaffold, skip the rest of this section.
2. Parse the snapshot comment. If absent → treat as legacy or hand-edited; ask the user before overwriting.
3. Re-run `pre-flight-discovery.md` against the current repo state.
4. Build a fresh field map.
5. Diff fresh vs snapshot. Categorize:
   - **No-op**: only `generated` and / or `skill-version` drifted (and the version drift is minor).
   - **Surgical patch**: one or more code-affecting fields drifted (`stack`, `ui-kit`, `auth-method`, `docs-ui`, `docs-route`, `db`, `repos-shape`, `mcp-config-files`, `language`, `openapi-spec`).
   - **Re-publish only**: `publisher` or `credentials-source` drifted, code-affecting fields unchanged.
   - **Full re-scaffold**: `skill-version` major bump OR three or more code-affecting fields drifted simultaneously (likely the project was rewritten — safer to ask).
6. Report the diff to the user before applying anything. Surgical patch is the default; the user can opt for full re-scaffold instead.

---

## Two-pass content-hash (write the snapshot twice on a fresh scaffold)

`content-hash` is computed against the **rendered credentials-content body** (after `.agents/project.yaml` substitution but BEFORE real passwords). On a fresh scaffold, the body does not exist yet when the page file is first written — chicken-and-egg.

Resolve by writing the snapshot twice in the same run:

**Pass 1 — page codegen (Phase 4)**:

Write the snapshot with `content-hash=sha256:pending-post-publish` (literal placeholder). All other fields are known at this point.

```
/* qa-guide-snapshot
   …
   content-hash=sha256:pending-post-publish
   …
*/
```

This is intentional — the page file lands on disk during Phase 4 with an obvious placeholder. `verification-checklist.md` step 7 catches the placeholder and forces Pass 2.

**Pass 2 — after publish (end of Phase 6)**:

Once the credentials-content body has been built (Phase 5) and published (Phase 6):

1. Compute `sha256(rendered-body)` against the body BEFORE password substitution (because passwords stay as `<see secrets store>` placeholders — they are not part of the hash input). Implementation: hash the exact string the publish step sent over the wire (without any per-destination wrapper conversion).
2. Patch the page file in place: replace `content-hash=sha256:pending-post-publish` with `content-hash=sha256:<actual-hex>`.
3. Re-stage the page file in git so the commit captures the final hash.

Pass 2 also runs on a **re-publish-only** outcome (publisher changed, page code unchanged) — the hash input is the rendered body, not the page, so a re-publish always updates the hash.

If the run aborts between Pass 1 and Pass 2 (e.g. publish failed, user cancelled), the placeholder stays in the file. The next re-run detects `content-hash=sha256:pending-post-publish` and treats it as "Pass 1 incomplete — resume from Phase 5", not as drift.

## Surgical patch rules

When the diff says surgical patch, regenerate ONLY the sections whose driving fields drifted. Other sections must stay byte-identical (preserve any hand-edits the user made between runs).

| Drifted field                      | Sections to regenerate                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `stack`                            | routing file location + §5 + §6 code blocks + the architecture-table stack label.                |
| `ui-kit`                           | every component import + JSX primitive (Button, Card, Accordion, Tabs).                          |
| `icons`                            | icon imports only.                                                                               |
| `auth-method`                      | §5 AuthMethods tabs (API curl, JWT vs cookie vs X-API-Key, body shape) + §6 Playwright login fixture. |
| `docs-ui` / `docs-route`           | §5 docs link (renderer label + href).                                                            |
| `db`                               | §4 (DBHub connection template + smoke-test query + the VSCode URI scheme).                        |
| `repos-shape`                      | §2 architecture diagram Repos block (mono ↔ poly).                                               |
| `mcp-config-files`                 | which agent tabs render across §3–§6 (claude/opencode/codex/gemini).                             |
| `language`                         | visible copy only. Code identifiers, `data-testid`s, snapshot fields untouched.                  |
| `publisher` / `credentials-source` | credentials CTA `href` + button copy. Re-publish the artifact via the new channel adapter.       |
| `openapi-spec`                     | §5 OpenAPI MCP `OPENAPI_SPEC_PATH` + docs UI link.                                               |

After the patch:

- Re-compute `content-hash`.
- Update `generated`.
- Write the updated snapshot comment.

---

## Hand-edit policy

Some users will hand-edit the page between runs (e.g. add a custom section). The skill respects this:

- The orchestrator never touches sections OUTSIDE the snapshot-driven set above.
- Custom-marked regions (`{/* qa-guide:user-region:start */}` … `{/* qa-guide:user-region:end */}`) are preserved as-is across surgical patches.
- If a custom region appears INSIDE a section the patch wants to regenerate, the orchestrator surfaces the conflict to the user before writing.

---

## When the snapshot is missing or corrupt

- Missing comment: assume hand-authored. Ask the user: `Existing /qa page has no snapshot. Treat as legacy + take over? (yes regenerates with a snapshot; no aborts)`.
- Corrupt comment (unparseable field): same prompt as missing.
- Snapshot exists but the file the snapshot points to is missing: regenerate from scratch.

---

## Exit reports

| Outcome                             | Report shape                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fresh scaffold                      | `Created /qa with snapshot { stack, ui-kit, …, generated }. Credentials artifact published to <URL>.`                       |
| Surgical patch                      | `Patched /qa. Sections regenerated: [list]. Drifted fields: [list]. Credentials artifact: <re-published / unchanged>.`      |
| No-op                               | `/qa is up to date with the current stack snapshot. Nothing to do.`                                                         |
| Re-publish only                     | `Page unchanged. Credentials artifact re-published to <new URL>.`                                                           |
| Full re-scaffold (with user opt-in) | `Re-scaffolded /qa. Backed up previous page to .context/legacy/qa-page-<timestamp>.tsx. Credentials artifact re-published.` |
