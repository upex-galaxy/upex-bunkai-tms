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
   skill-version=1.0.0
   stack=next-15.0.3
   ui-kit=shadcn
   icons=lucide-react
   auth=authjs-5.0.0
   db=supabase-postgres
   orm=drizzle
   language=es
   publisher=jira-epic
   credentials-source=https://upex.atlassian.net/browse/UPEX-321
   openapi-spec=/api/openapi.json
   default-branch=staging
   generated=2026-05-15
   content-hash=sha256:8a2f7c…
*/
```

---

## Fields (canonical list)

| Field                | Source                                          | Drift triggers…                                                                                                  |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `skill-version`      | this skill's own version                        | Major bump → full re-scaffold. Minor → no-op unless other fields drifted.                                        |
| `stack`              | pre-flight detection (framework + version)      | §4.5 (API testing code), §4.6 (Playwright code), routing file location.                                          |
| `ui-kit`             | pre-flight detection                            | All component-rendering sections (re-emit Buttons / Cards / Accordions using the new kit).                       |
| `icons`              | pre-flight detection                            | Icon import lines only.                                                                                          |
| `auth`               | pre-flight detection                            | §4.4 (DB role guidance), §4.5 (login curl, header name, body shape).                                             |
| `db`                 | pre-flight detection                            | §4.4 (DBHub connection string template).                                                                         |
| `orm`                | pre-flight detection                            | Architecture table label only. No code drift.                                                                    |
| `language`           | Q5 / pre-flight i18n signal                     | All visible copy. Code identifiers untouched.                                                                    |
| `publisher`          | Q1                                              | Credentials CTA href + button copy.                                                                              |
| `credentials-source` | publish step (Phase 6)                          | Credentials CTA href.                                                                                            |
| `openapi-spec`       | pre-flight detection                            | §4.5 OpenAPI MCP example + Swagger UI link.                                                                      |
| `default-branch`     | pre-flight `git` detection                      | `/git-flow-master` base branch for the patch PR.                                                                 |
| `generated`          | wall-clock at write time                        | Audit field. Does NOT trigger patch.                                                                             |
| `content-hash`       | sha256 of the rendered credentials-content body | Drift in the credentials artifact triggers a re-publish (but NOT a page re-render unless the page also drifted). |

---

## Diff procedure (Phase 2 of SKILL.md)

1. Read the page file at the resolved route (Q3 or detected). If no file exists → fresh scaffold, skip the rest of this section.
2. Parse the snapshot comment. If absent → treat as legacy or hand-edited; ask the user before overwriting.
3. Re-run `pre-flight-discovery.md` against the current repo state.
4. Build a fresh field map.
5. Diff fresh vs snapshot. Categorize:
   - **No-op**: only `generated` and / or `skill-version` drifted (and the version drift is minor).
   - **Surgical patch**: one or more code-affecting fields drifted (`stack`, `ui-kit`, `auth`, `db`, `language`, `openapi-spec`).
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
| `stack`                            | routing file location + §4.5 + §4.6 code blocks + the architecture-table stack label.            |
| `ui-kit`                           | every component import + JSX primitive (Button, Card, Accordion, Tabs).                          |
| `icons`                            | icon imports only.                                                                               |
| `auth`                             | §4.5 (API testing curl, JWT vs cookie header, body shape) and the §4.6 Playwright login fixture. |
| `db`                               | §4.4 (DBHub connection-string template + smoke-test query).                                      |
| `language`                         | visible copy only. Code identifiers, `data-testid`s, snapshot fields untouched.                  |
| `publisher` / `credentials-source` | credentials CTA `href` + button copy. Re-publish the artifact via the new channel adapter.       |
| `openapi-spec`                     | §4.5 OpenAPI MCP `OPENAPI_SPEC_PATH` + Swagger UI link.                                          |

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
