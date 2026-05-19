# Path B — `getdesign` + LLM-matcher (default)

This is the default path of `/design-system`. It picks one of 72 curated brands from the `getdesign` catalog (MIT, free, no auth) and lands the corresponding `DESIGN.md` at the project root. The flow is fully automatable when Constitution + PRD context exists, and falls back to a short Q&A otherwise.

Why this is the default: it is the only path that combines (a) zero manual effort, (b) deterministic file output, (c) curated quality (each brand in `getdesign` is a hand-tuned MIT-licensed DESIGN.md), and (d) no external account or API key. Both `getdesign` and the Google Labs linter run via `npx`, so nothing gets installed globally.

---

## 1. Pre-flight

Verify `npx` is available before doing anything else. If the user is offline or `node`/`npm` are missing, the rest of the path is unreachable.

```bash
which npx || echo "npx missing — install Node.js or use Path E (LLM-authored)"
```

Optionally probe that the package resolves (cheap network check, does not actually install):

```bash
npx --yes getdesign --version 2>/dev/null || echo "warning: getdesign package not reachable; check connectivity"
```

Why an optional probe: if offline, the catalog fetch in step 3 will fail anyway. Surfacing it now lets the orchestrator suggest Path E (LLM-authored) before wasting the user's time.

---

## 2. Context loading

Read the Constitution + PRD signals that inform brand matching. Each file is independent — if some exist and others do not, use what you have.

| File                                  | Extracted signals                                     |
| ------------------------------------- | ----------------------------------------------------- |
| `.context/business/business-model.md` | industry, value-proposition, key terms, target market |
| `.context/PRD/personas.md`            | target demographic, tone words, persona archetypes    |
| `.context/PRD/executive-summary.md`   | positioning, competitive frame, success metrics       |

Parsing rule: pull keywords and phrases that already exist in the docs. Do not synthesize signals the docs do not state — the matcher trusts inputs blindly, so noise here causes bad matches.

### Q&A fallback (brownfield / no context)

If NONE of the three files exist, drop into a 5-question Q&A. Ask one at a time, document each answer in a working JSON object that becomes `BusinessContext`.

1. **Industry**: "What sector is the product in?" (e.g. fintech, wellness, ecommerce, dev-tools)
2. **Tone**: "1-3 words describing the visual tone." (e.g. minimal + serious, warm + playful)
3. **Target**: "B2B, B2C, or internal tool?"
4. **Competitors**: "Free list of 3-5 brands the visual identity should evoke." (e.g. Linear, Vercel, Notion)
5. **Keywords**: "Free list of visual cues." (e.g. dark, premium, data-dense, illustrated)

Why ask explicitly: the matcher needs `industry`, `tone[]`, `target`, `competitors[]`, `keywords[]` populated to produce meaningful scores. Skipping fields collapses the signal and the top-3 ends up generic.

Save the resulting object to a temp file (e.g. `/tmp/design-context.json`) so the matcher script can read it as a single argument.

---

## 3. Catalog fetch

The `getdesign` CLI emits **plain text** (one line per brand: `slug - description`); the documented `--json` flag is silently ignored as of v0.6.17. Pipe through a small Bun parser to produce the JSON shape the matcher expects:

```bash
npx --yes getdesign list 2>/dev/null | bun -e '
const text = await Bun.stdin.text();
const brands = text
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const idx = line.indexOf(" - ");
    if (idx === -1) return null;
    return {
      slug: line.slice(0, idx).trim(),
      description: line.slice(idx + 3).trim(),
    };
  })
  .filter(Boolean);
console.log(JSON.stringify(brands, null, 2));
' > /tmp/getdesign-catalog.json

echo "Loaded $(jq 'length' /tmp/getdesign-catalog.json) brands from getdesign"
```

Why a temp file: avoids re-fetching across retries within the same session, keeps the matcher script side-effect-free, and lets the user `cat` it if they want to inspect.

Each parsed entry has `{ slug, description }`. The raw CLI does not emit `tags` or `name` fields — the matcher derives tag-like signal by tokenizing the description (see `scripts/match-brand.ts`). Some slugs contain dots (e.g. `linear.app`, `mistral.ai`); the parser preserves them as-is.

---

## 4. Matching

Invoke the bundled script. It is deterministic, takes the context JSON and the catalog JSON, returns top-N candidates.

```bash
bun .claude/skills/design-system/scripts/match-brand.ts \
  --context /tmp/design-context.json \
  --catalog /tmp/getdesign-catalog.json \
  --top 3
```

The script expects a `BusinessContext` shaped exactly as documented in plan §5.1:

```ts
type BusinessContext = {
  industry: string; // "fintech" | "wellness" | "ecommerce" | ...
  tone: string[]; // ["serious", "minimal"]
  target: string; // "B2B" | "B2C" | "internal"
  competitors: string[]; // ["Linear", "Vercel", "Notion"]
  keywords: string[]; // ["dark", "premium", "data-dense"]
};
```

Output shape (stdout, JSON):

```json
[
  {
    "slug": "linear-app",
    "name": "Linear",
    "score": 0.87,
    "reason": "matched on dark + B2B + Linear competitor"
  },
  {
    "slug": "vercel",
    "name": "Vercel",
    "score": 0.72,
    "reason": "matched on dark + dev-tools + minimal"
  },
  {
    "slug": "notion",
    "name": "Notion",
    "score": 0.65,
    "reason": "matched on minimal + productivity tone"
  }
]
```

If the matcher returns less than 3 candidates (small catalog overlap), surface the count and offer to fall through to Path A (manual gallery) or Path E (LLM-authored).

After this step, `match-brand.ts` is referenced as `match-brand.ts` for brevity.

---

## 5. User confirmation

Use AskUserQuestion with three options, one per candidate. Each option carries the score and the matcher's stated reason — never invent extra detail.

- **Label**: `<brand-name> — <score>` (e.g. `linear-app — 0.87`)
- **Description**: 1-line tagline (from `catalog.description`, truncated to ~80 chars) + the matcher `reason`.

Add a fourth implicit "Other" option that loads the next batch of 3 candidates (rank 4-6). The user can request more options up to the catalog size; offer Path A as an exit if they run out of patience.

Example AskUserQuestion payload sketch:

```json
{
  "question": "Three candidates matched your context. Pick one to download as DESIGN.md.",
  "options": [
    {
      "label": "linear-app — 0.87",
      "description": "Issue tracking for software teams. Matched on dark + B2B + Linear competitor."
    },
    {
      "label": "vercel — 0.72",
      "description": "Develop. Preview. Ship. Matched on dark + dev-tools + minimal."
    },
    {
      "label": "notion — 0.65",
      "description": "All-in-one workspace. Matched on minimal + productivity tone."
    }
  ]
}
```

---

## 6. Download

```bash
npx --yes getdesign add <slug>
```

By default, `getdesign` writes to `./DESIGN.md`. If `.agents/project.yaml` has a non-default `design_md_path`, pass `--out`:

```bash
DESIGN_MD_PATH=$(yq '.design_md_path // "./DESIGN.md"' .agents/project.yaml)
npx --yes getdesign add <slug> --out "$DESIGN_MD_PATH"
```

### Overwrite handling

Before running `getdesign add`, check if the target file already exists. If it does, ask the user via AskUserQuestion:

1. **skip** — keep the current `DESIGN.md` and exit the skill. Report what was skipped.
2. **overwrite** — replace in place. Pass `--force` to `getdesign add` if the CLI prompts.
3. **variant** — append the slug to the filename. Run with `--out DESIGN.<slug>.md` so the original stays intact (useful for A/B branding or light/dark variants).

Why ask: silently overwriting a hand-curated DESIGN.md is destructive and not recoverable from inside this skill.

---

## 7. Validation

```bash
npx --yes @google/design.md lint <path>
```

Capture stdout and exit code. Parse stdout for:

- **Errors** — surface verbatim and stop. Offer the user: retry with a different brand, run lint:check with `--strict false`, or hand-edit.
- **WCAG warnings** — surface as a separate section in the final report. Do not block on them; the user may accept them, but they need to see them.

If the lint exits 0 with no warnings, proceed silently to step 8.

---

## 8. Report

Print a concise summary to the user. The orchestrator will relay it.

```
DESIGN.md generated.

Brand chosen:   linear-app  (score 0.87)
Reason:         matched on dark + B2B + Linear competitor
Path:           ./DESIGN.md
Sections:       Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's/Don'ts
Tokens:         colors (4), typography (6), rounded (3), spacing (4)
Lint:           PASS (WCAG AA: primary/background contrast 12.1, accent/background 4.8)

Next step:      hand back to /project-foundation (Phase 3 — SRS) or /project-bootstrap (frontend-setup).
```

Why this format: the report is the only artifact the orchestrator sees after delegation, so it doubles as the audit trail. Keep it scannable.

---

## Troubleshooting

| Symptom                                                    | Cause                                              | What to do                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npx getdesign` hangs or 404s                              | Offline, or registry unreachable                   | Surface the network error. Offer Path E (LLM-authored) which has no external dependency.                                         |
| `getdesign list` output is empty or the parser yields `[]` | Package broken upstream, format changed            | Pin to a known-good version: `npx --yes getdesign@0.6.17 list`. If still empty after pin, fall back to Path A.                   |
| Matcher returns top-3 with score < 0.4                     | Business context too narrow, no good catalog match | Offer Path E. The catalog is curated for common patterns; very specific niches (e.g. STEM kids ed) do not match well.            |
| `@google/design.md lint` exits non-zero with parse error   | `DESIGN.md` malformed, or schema drift             | Re-fetch via `getdesign add <slug> --force`. If still failing, file the lint stdout in the report and ask the user to escalate.  |
| WCAG contrast fails                                        | Brand uses bold palette that does not meet AA      | Surface the failing pair. Offer the user: pick another brand, or accept and override via the `--strict false` flag at lint time. |
| User says "none of these fit" after 2 batches              | Catalog exhausted for this context                 | Drop to Path E (`references/llm-authored.md`) with the same context JSON as input.                                               |
