# Path B: `getdesign` plus the LLM matcher (default)

This is the default path of `/design-system`. It picks one brand from the `getdesign` catalog (MIT, free, no auth) and lands the matching `DESIGN.md` at the project root. When Constitution and PRD context exist, the whole flow runs without questions. Without them, a short Q&A fills the gap.

It is the default because it needs no manual effort, produces a deterministic file, starts from a hand-tuned MIT-licensed `DESIGN.md`, and asks for no account or API key. `getdesign` and the Google Labs linter both run through `npx`, so nothing is installed globally.

---

## 1. Pre-flight

Check that `npx` is available first. Offline, or without `node`/`npm`, the rest of the path cannot run.

```bash
which npx || echo "npx missing — install Node.js or use Path E (LLM-authored)"
```

Optionally probe that the package resolves (a cheap network check that installs nothing):

```bash
npx --yes getdesign --version 2>/dev/null || echo "warning: getdesign package not reachable; check connectivity"
```

The probe is worth running because the catalog fetch in step 3 fails anyway when offline, and finding that out now lets you suggest Path E before the user has waited on anything.

---

## 2. Context loading

Read the Constitution and PRD signals that inform brand matching. The files are independent: use whichever exist.

| File                                  | Extracted signals                                     |
| ------------------------------------- | ----------------------------------------------------- |
| `.context/business/business-model.md` | industry, value-proposition, key terms, target market |
| `.context/PRD/personas.md`            | target demographic, tone words, persona archetypes    |
| `.context/PRD/executive-summary.md`   | positioning, competitive frame, success metrics       |

Pull keywords and phrases the documents already contain, and add none of your own. The matcher trusts its input blindly, so an invented signal becomes a bad match.

### Q&A fallback (brownfield or no context)

When none of the three files exists, ask five questions one at a time and record each answer in a working JSON object that becomes the `BusinessContext`:

1. Industry: "What sector is the product in?" (for example fintech, wellness, ecommerce, dev-tools)
2. Tone: "1-3 words describing the visual tone." (for example minimal + serious, warm + playful)
3. Target: "B2B, B2C, or internal tool?"
4. Competitors: "Free list of 3-5 brands the visual identity should evoke." (for example Linear, Vercel, Notion)
5. Keywords: "Free list of visual cues." (for example dark, premium, data-dense, illustrated)

The matcher scores on `industry`, `tone[]`, `target`, `competitors[]` and `keywords[]`. Leave one empty and the signal collapses, so the top 3 comes out generic.

Save the object to a temp file (for example `/tmp/design-context.json`) so the matcher script reads it as one argument.

A supervised worker sends these questions to its conductor, which holds the gate. A routine with nobody cannot ask (`agentic-dev-core/references/decision-protocol.md` §5.2). Use the brief's context if it carries one. Otherwise follow `agentic-dev-core/references/decision-protocol.md`: take the signals you can find in the repo (README, package description, landing copy), say in the report which ones you assumed, and continue. If the repo has no signal at all, stop before the download and report that Path E or a human answer is needed.

---

## 3. Catalog fetch

The `getdesign` CLI prints **plain text**, one line per brand (`slug - description`). Its documented `--json` flag is silently ignored (the release checked is in `.context/ADR/ADR-0003-forensic-measurements-ledger.md`; re-check after an upgrade). Pipe the output through a small Bun parser to get the JSON shape the matcher expects:

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

The temp file saves a re-fetch on retries within the session, keeps the matcher free of side effects, and lets the user `cat` it.

Each parsed entry is `{ slug, description }`. The raw CLI emits no `tags` or `name`, so the matcher tokenizes the description to get tag-like signal (see `scripts/match-brand.ts`). Some slugs contain dots (`linear.app`, `mistral.ai`) and the parser keeps them as they are.

---

## 4. Matching

The bundled script is deterministic. It takes the context JSON and the catalog JSON and returns the top N candidates.

```bash
bun .agents/skills/design-system/scripts/match-brand.ts \
  --context /tmp/design-context.json \
  --catalog /tmp/getdesign-catalog.json \
  --top 3
```

The context must be shaped exactly like this `BusinessContext`:

```ts
type BusinessContext = {
  industry: string; // "fintech" | "wellness" | "ecommerce" | ...
  tone: string[]; // ["serious", "minimal"]
  target: string; // "B2B" | "B2C" | "internal"
  competitors: string[]; // ["Linear", "Vercel", "Notion"]
  keywords: string[]; // ["dark", "premium", "data-dense"]
};
```

Output (stdout, JSON):

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

When the matcher returns fewer than 3 candidates (small catalog overlap), say how many it found and offer to fall through to Path A (manual gallery) or Path E (LLM-authored).

From here on, `match-brand.ts` is just `match-brand.ts`.

---

## 5. User confirmation

Ask with AskUserQuestion, one option per candidate. Each option carries the score and the matcher's own reason, with no extra detail from you.

- Label: `<brand-name> — <score>` (for example `linear-app — 0.87`)
- Description: a one-line tagline (from `catalog.description`, cut to about 80 characters) plus the matcher `reason`.

A fourth implicit "Other" option loads the next batch of 3 candidates (rank 4 to 6). The user can keep asking up to the catalog size; offer Path A as an exit when they tire of it.

Example payload:

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

With nobody at the keyboard, take the top-scoring candidate only when its score is 0.4 or higher (below that, see Troubleshooting), write the pick and its score in the report, and keep the other two as the alternatives. A supervised worker leaves the choice to its conductor.

---

## 6. Download

```bash
npx --yes getdesign add <slug>
```

By default `getdesign` writes `./DESIGN.md`. When `.agents/project.yaml` sets a non-default `design_md_path`, pass `--out`:

```bash
DESIGN_MD_PATH=$(yq '.frontend.design_md_path // "./DESIGN.md"' .agents/project.yaml)
npx --yes getdesign add <slug> --out "$DESIGN_MD_PATH"
```

### Overwrite handling

Before `getdesign add`, check whether the target file exists. If it does, ask with AskUserQuestion, because a hand-curated `DESIGN.md` cannot be recovered from inside this skill:

1. skip: keep the current `DESIGN.md`, exit the skill, and report what was skipped.
2. overwrite: replace it in place. Pass `--force` to `getdesign add` if the CLI prompts.
3. variant: append the slug to the filename with `--out DESIGN.<slug>.md`, so the original stays intact (useful for A/B branding or light/dark variants).

With nobody at the keyboard, choose **variant**. It is the reversible option, and the report tells the owner where the new file is.

---

## 7. Validation

```bash
npx --yes @google/design.md lint <path>
```

Capture stdout and the exit code, then read stdout for two things:

- Errors: report them verbatim and stop. Offer the user a retry with a different brand, `lint:check` with `--strict false`, or a hand edit.
- WCAG warnings: report them in their own section of the final report. They do not block, since the user may accept them, but the user has to see them.

Exit 0 with no warnings means you go straight to step 8.

---

## 8. Report

Print a short summary for the orchestrator to relay. It is the only artifact the orchestrator sees after the delegation, so it doubles as the audit trail.

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

---

## Troubleshooting

| Symptom                                                    | Cause                                              | What to do                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npx getdesign` hangs or 404s                              | Offline, or registry unreachable                   | Report the network error. Offer Path E (LLM-authored), which has no external dependency.                                         |
| `getdesign list` output is empty or the parser yields `[]` | Package broken upstream, format changed            | Pin to a known-good version: `npx --yes getdesign@0.6.17 list`. If still empty after pin, fall back to Path A.                   |
| Matcher returns top-3 with score < 0.4                     | Business context too narrow, no good catalog match | Offer Path E. The catalog covers common patterns; very specific niches (for example STEM kids ed) do not match well. With nobody at the keyboard: record the gap and stop with a report. |
| `@google/design.md lint` exits non-zero with parse error   | `DESIGN.md` malformed, or schema drift             | Re-fetch via `getdesign add <slug> --force`. If it still fails, put the lint stdout in the report and ask the user to escalate.  |
| WCAG contrast fails                                        | Brand uses bold palette that does not meet AA      | Report the failing pair. Offer the user: pick another brand, or accept and override via the `--strict false` flag at lint time.  |
| User says "none of these fit" after 2 batches              | Catalog exhausted for this context                 | Drop to Path E (`references/llm-authored.md`) with the same context JSON as input.                                               |
