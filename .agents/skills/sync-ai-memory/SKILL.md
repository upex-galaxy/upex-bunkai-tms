---
name: sync-ai-memory
description: "Audit and sync all AI-consumed documentation in this repo against the current repo state: AGENTS.md (canonical AI memory), README.md, CONTEXT.md, INSTALLER.md, docs/**, and the hand-maintained docs/onboarding.html. Patches drifted facts in place; never rewrites from scratch. Use for sync ai memory, sync docs, sincronizar memoria, docs audit, realinear documentación con el estado del repo, refresh memory, refresh ai memory, actualizar memoria, refrescar documentación, documentation drift. The CLAUDE.md shim is verified, never patched: operational prose found there is structural drift that stops the run. Do NOT use for writing new docs (use /project-foundation), generating business maps (use project-context), or Engram memory operations."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
---

# Sync AI Memory

Use `references/sync.md` for this skill's only mode, `sync`.

## Compact Rules

- Single mode: `sync` → `references/sync.md`. Legacy `/sync-ai-memory` invocations and the aliases `refresh memory` / `refresh ai memory` / `actualizar memoria` route to `sync`. Forward `$ARGUMENTS` unchanged.
- Shim guard (Step 0, before anything else): `AGENTS.md` is the canonical AI memory and the target of every sync. `CLAUDE.md` must be exactly `@AGENTS.md` plus one newline. Operational prose found in `CLAUDE.md` is STRUCTURAL DRIFT: STOP, report it, never propagate it into `AGENTS.md` or any other doc. Missing `AGENTS.md` → STOP, never create it from a template.
- Targets: `AGENTS.md`, `README.md`, `CONTEXT.md`, `INSTALLER.md`, `docs/**` (per audit), `docs/onboarding.html` (standalone HTML, text nodes only). Never targets: `CLAUDE.md`, `.claude/commands/*.md`, `.opencode/commands/*.md`, `.claude/skills` alias, `.agents/skills/*/SKILL.md`, `.agents/skills/*/references/*`, `.agents/skills/REGISTRY.md`, `.context/` outputs owned by `project-context`.
- Patch, never rewrite: the current file IS the base; `Edit` only, never `Write` on an existing file. Preserve headers, prose, examples, table widths byte-for-byte except the changed cell. Structural drift (obsolete section, forbidden section reappearing) is flagged, never auto-applied.
- Approval gate before any write: audit (delegated sub-agent) → prioritized list → wait for `proceed` / `adjust` / `abort`.
- Cross-doc consistency before writing: a fact that appears in several docs must agree everywhere; patch the lagging copy in the same run.
- Credential redaction scan in memory before every write; every redaction is surfaced in the report.
- This skill synchronizes repository documents only. It does not read, write, merge, or replace Engram observations.

**Read full SKILL.md when**: the audit scope is disputed, a structural-drift flag needs the preserve-list, or the standalone-HTML patch rules are needed.

## Routing contract

- Load `references/sync.md`, run its Step 0 contract check, patch only verified facts, preserve all protected sections, run its cross-document and security checks, then report per-file outcomes.
- `$ARGUMENTS`: repository path; blank means the current repo.
- Business maps and roadmaps are owned by skill `project-context`; this skill checks they exist and that `AGENTS.md` lists them, and never rewrites their content.
