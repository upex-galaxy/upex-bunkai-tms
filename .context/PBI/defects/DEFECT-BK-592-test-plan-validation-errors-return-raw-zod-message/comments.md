# Comments for BK-592

[View in Jira](https://jira.upexgalaxy.com/browse/BK-592)

---

### Ely - 8/21/2026, 6:46:03 PM

## Dev → QA handoff — BK-592

***Merged******:*** PR #196 -> `staging` (`40c58bac`, ancestry-verified against `origin/staging`, not inferred from a status flip).

### What was actually wrong

Not a wrong string — a ***duplicated*** one. The ratified copy was written out twice: once as a Zod message in `lib/test-plans/validation.ts`, once as a string literal in `lib/test-plans/errors.ts`.

Because the Zod pre-check fails fast, a malformed body never reaches the RPC, so `mapTestPlanRpcError`'s `45600` arm — the one holding the ratified wording — was ***unreachable for exactly the inputs it described***. The two copies drifted and nothing could surface it: each file read correctly on its own.

Correcting only the four reported strings would have left that shape intact and made the next drift equally invisible. The copy is now declared ***once***, derived from the bounds it describes, and consumed by both layers.

### What to re-test

All four rows of the defect's table, expecting `Name must be between 1 and 100 characters.` and an unchanged ***422***:

| AC | Input |
| --- | --- |
| 1.4 | 101-character name |
| 3.1 | whitespace-only name |
| 3.2 | empty-string name |
| 3.3 | tab/newline-only name |

Also worth a pass, because they changed and the defect did not mention them:

- `description`*** over 500**** and `goal`**** over 100**** — these carried the same latent divergence (the two copies differed only by a ****trailing period***). Both now return the mapper's wording exactly: `Description must be 500 characters or fewer.` and `Goal must be 100 characters or fewer.`
- Status codes and rejection behaviour are unchanged throughout — this was a copy defect only. A regression here would show up as a wrong ***status***, not wrong text.

### Automated coverage

Two existing tests in `validation.test.ts` were ***asserting the defective copy and passing****, holding the bug in place; they now assert the ratified copy. New coverage pins the four scenarios above and, more importantly, the ****cross-layer invariant***: the Zod message and the `45600` mapping must be byte-identical, asserted by calling both. Re-inlining a literal in either module breaks those assertions by construction.

Verified ***18 pass / 8 fail**** with the source fix reverted (failing on all four scenarios plus the invariant plus the description/goal drift) and ****26 pass / 0 fail*** with it applied. `types:check` clean, `lint:check` 0 errors, full suite 1626 pass / 1 fail (`BK-34 ATC-01`, pre-existing, unrelated).

No migration, no schema change.

### Deliberately not touched

`lib/environments/` and `lib/milestones/` also ship `Name is required`, but that is ***their own*** ratified wording — BK-202's copy ruling does not govern them, and changing them here would be scope creep dressed as consistency.

Flagged for a separate ticket: `lib/milestones/` carries the same ***structural*** duplication (copy written out in both its schema and its mapper), so it is exposed to this exact defect class even though its strings currently agree.

---

**Delivered by the scheduled autonomous **`bug`** routine. Status moved Open -> In Progress -> In Review -> Ready For QA manually****:**** the workflow's auto-transition on merge did not fire for this issue type either. Assignee left as ******Alfonso Hernandez******, identified from BK-202's comment trail as the shift-left QA owner (author of the ATP draft, the open-questions resolution, and the QA Testing Complete pass that filed this defect) rather than defaulted from the reporter field.**

---


_Synced from Jira by sync-jira-issues_
