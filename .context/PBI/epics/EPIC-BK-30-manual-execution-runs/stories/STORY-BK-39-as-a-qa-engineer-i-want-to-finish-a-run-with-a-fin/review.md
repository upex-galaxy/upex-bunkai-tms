# BK-39 — Code Review (adjudicated)

Independent adversarial review of `feature/BK-39-finish-verdict` vs the BK-36 abort sibling + BK-39 AC. **Verdict: APPROVE-WITH-FIXES** — 0 BLOCKER, 0 MAJOR.

## Adjudication (orchestrator-owned)

| # | Sev | Finding (file:line) | Verdict | Action |
|---|-----|---------------------|---------|--------|
| 1 | MINOR | Dead `else` optimistic-fallback in `handleFinish` stamps a client-clock `finished_at`, contradicting "server time = source of truth"; unreachable (route always returns `{run}`). `RunnerView.tsx` | **legitimate** | Delete the `else`; keep `if (body.run) setView(body.run)`. |
| 2 | MINOR | Unreachable `if (!verdict)` guard in `handleFinish` (Confirm is `disabled` until a verdict) + a 3rd divergent copy. `RunnerView.tsx` | **legitimate** | Remove the dead guard. |
| 3 | MINOR | UI never surfaces an explicit "final verdict required" message (story-body negative AC). Disable-until-valid is defensible but the body AC wording is literal. | **legitimate (soft)** | Add a small required-hint in the modal until a verdict is picked. |
| 4 | MINOR | `canManageRun` role gate computed against the active-workspace cookie, not the run's workspace — wrong button show/hide on a cross-workspace deep-link. NOT a security hole (RPC re-checks; 403 on misuse). Pre-existing from BK-34/BK-36; BK-39 only renamed `canAbort`→`canManageRun`. | **dismiss (out of scope)** | Not a BK-39 regression. Note for a future tech-story to derive the gate from the run's workspace. |
| 5 | NIT | `data-testid` uses `finish-*`/`run-final-verdict`, breaking the component's `runner-*` convention (`runner-abort-*`). | **legitimate** | Rename to `runner-finish-*` / `runner-final-verdict`. |
| 6 | NIT | `AbortErrorBody` interface reused to parse finish errors; toast punctuation drift (`Run finished.` vs `Run aborted`); verdict toggle group lacks `role="group"`/label. | **legitimate (polish)** | Rename to `RunActionErrorBody`; align toast (no period); add group label/`aria` to the verdict toggle. |
| — | NIT | 409 copy has a trailing period vs AC Gherkin. | **dismiss** | Intentional — matches the shipped abort sibling + the frozen AC-exact form. |

## Verified correct (no defects)
Migration/RPC validation order byte-faithful to abort; `abort_reason` never written (CHECK holds); only `pending` steps/atcs skipped, executed preserved; `FOR UPDATE` first-wins; `SECURITY DEFINER` + `search_path=''`, all refs schema-qualified; no injection (verdict enum-gated + re-checked); SQLSTATE 45206/45207 collision-free; route `run:execute` parity, UUID extraction, non-disclosure (P0002→404, 42501→403), no AI/CI authz bypass; UI gate + pending count match the RPC skip predicate; hydration-safe timestamp; `tsc` clean.

## Fixes applied this pass
#1, #2, #3, #5, #6 → applied in `RunnerView.tsx` (+ re-verified types/lint/format). #4 dismissed (out of scope, logged for a tech-story).
