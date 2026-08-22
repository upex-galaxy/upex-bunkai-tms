# Comments for BK-591

[View in Jira](https://jira.upexgalaxy.com/browse/BK-591)

---

### Ely - 8/21/2026, 6:34:08 PM

## Dev → QA handoff — BK-591

> ***NOTE:**** The root cause in this ticket's description was ****incomplete***, and implementing it as written would have replaced the 409 with a 500. Details below — worth reading before re-testing AC 2.4.

***Merged******:*** PR #195 -> `staging` (`bf39c393`, ancestry-verified against `origin/staging`, not inferred from a status flip).

### What was actually wrong

The ticket named `0073*test*plans.sql` lines 210 and 305. There are ***six*** sites, and the two table CHECK constraints are among them.

`0073` line 24 asserts **"**`\s`** covers tab/newline but NOT U+00A0"**, and `lib/test-plans/validation.ts` asserts the mirror image about Postgres. ***Both are false.*** Postgres `\s` is `[[:space:]]`, which under this instance's UTF-8 collation does match U+00A0. Verified on the live database before any code was written:

| Expression on `a<U+00A0>b` | Result |
| --- | --- |
| `regexp_replace(..., '\s+', '|', 'g')` | `a|b` — collapses NBSP |
| `regexp_replace(..., '[\t\n\v\f\r ]+', '|', 'g')` | `a<U+00A0>b` — preserved |
| `btrim('x' || U+00A0)` | length 2 — `btrim` alone does not strip NBSP |

So the RPC collapsed the trailing NBSP to a space, `btrim` removed it, and the name landed on its unpadded twin: `23505` -> `409`.

***Why fixing only the RPCs would have failed******:*** the CHECK constraints carry the same `\s`. An RPC correctly storing a trailing-NBSP name would immediately violate `test*plans*name_check`. CHECK and RPC encode one rule and had to move together.

### What shipped

Migration `0074*test*plan*nbsp*whitespace_class.sql` swaps `'\s+'` for `'[\t\n\v\f\r ]+'` in ***both CHECK constraints and both RPCs****, for `name`**** and ***`goal` alike. `btrim()` is deliberately unchanged. `lib/test-plans/validation.ts` needed no behavioural change — it already spelled the class out — so only its misleading comment was corrected.

Migration applied to the shared instance and classified ***destructive***. Live definitions were re-read and diffed after the apply: 0 remaining `\s`, both constraints correct. No backfill required — 7 existing rows, 0 violating the new constraints.

### What to re-test

- ***AC 2.4 (the filed case)**** — `"<name>"` then `"<name>" + U+00A0` must now return ****201**** and create a ****distinct*** plan.
- ***Control, do not skip**** — `"<name>" + TAB` must ****still**** return ****409***. The fix must not have become "never normalize anything".
- `goal` — a trailing U+00A0 in `goal` is now preserved too; it was silently collapsed before.
- ***Rename path*** — `bunkai*update*test_plan` follows the same rulebook; renaming onto an NBSP-padded variant must not collide.
- Existing AC 2.1 / 2.2 / 2.3 / 2.5 / 2.6 behaviour is unchanged and still covered.

### Automated coverage

Regression case ***(m)**** in `lib/test-plans/test-plan-rpc-isolation.test.ts`, on the ****real RPC path*** through a real authenticated session — deliberately not a unit test of `normalizeTestPlanText`, since that layer was already correct and testing it would prove nothing. It reads the row back through an independent service-role client to confirm the U+00A0 byte reached storage.

Verified ***12 pass / 1 fail before**** the migration (failing at exactly the reported `23505`) and ****13 pass / 0 fail after***. `types:check` clean, `lint:check` 0 errors, full suite 1620 pass / 1 fail (`BK-34 ATC-01`, pre-existing fixture drift, unrelated).

### Related finding — not fixed here

`supabase/migrations/0064_milestones.sql` carries the ***identical ****`\s`**** defect*** at lines 49, 139 and 220. Milestones is a separate entity with its own ratified acceptance criteria, so correcting it inside this defect would have been scope creep and would have decided a question BK-202's ruling never asked. Flagged for its own ticket.

---

**Delivered by the scheduled autonomous **`bug`** routine. Status moved Open -> In Progress -> In Review -> Ready For QA manually****:**** the workflow's auto-transition on merge did not fire for this issue type. Assignee left as ******Alfonso Hernandez******, identified from this story's comment trail as the shift-left QA owner (author of the ATP draft, the open-questions resolution, and the QA Testing Complete pass that filed this defect) rather than defaulted from the reporter field.**

---


_Synced from Jira by sync-jira-issues_
