# Comments for BK-184

[View in Jira](https://jira.upexgalaxy.com/browse/BK-184)

---

### Benjamin Segovia - 6/30/2026, 9:42:27 PM

## Root cause confirmed — spec vs implementation field-name mismatch

Investigated the Duplicate ATC endpoint across the full stack. The mismatch is real and consistent — the implementation is NOT internally inconsistent, it simply diverges from the SRS spec:

| Layer | Field name used | Location |
| --- | --- | --- |
| SRS functional spec | `new_title` | `.context/SRS/functional-specs.md:122-123` |
| Request validation | `title` | `lib/atcs/validation.ts:60` |
| Route handler | `title` | `app/api/v1/atcs/[id]/duplicate/route.ts:35` |
| OpenAPI schema | `title` | `app/api/v1/atcs/[id]/duplicate/route.openapi.ts:8` |
| DB RPC parameter | `p*title` | `supabase/migrations/0028*atc_duplicate.sql:28` |

> ***INFO:**** Found an unresolved design discussion already in a related PBI's comment thread asking **"Final request field***:**** **`new_title`** or **`title`**?"** — the decision was never closed out, and the implementation went with `title` everywhere while the spec doc was never updated to match.

***This needs a PO/spec decision before a fix can be scoped***, not a straightforward "wrong code" bug:

- ***Option A*** — update the SRS spec to `title` (matches the current, internally-consistent implementation across validation, route, OpenAPI schema, and DB).
- ***Option B*** — rename the field to `new_title` across all 4 code locations to match the spec.

No code changes made — investigation only. Flagging for decision.

---

### Benjamin Segovia - 7/13/2026, 10:33:11 AM

## Dev hand-off

***Context******:**** filed during the BK-23 (Duplicate ATC) sprint-testing session (2026-06-26 → 2026-06-28), alongside BK-185. Both block that story's QA sign-off — result was ****FAILED → BLOCKED***.

***What's wrong******:*** the agreed spec for `POST /atcs/{source*id}/duplicate` (see BK-23's team discussion with the architect) defines the optional body field as `new*title`, but the implementation reads `title` instead. Any client following the documented contract silently fails to set the custom title.

***Ask******:*** align the API field name with the spec (`new_title`), or update the spec + BK-23's acceptance criteria if `title` is the intended final name — whichever direction, the contract and the implementation need to match before retest.

***Next step once fixed******:*** BK-23 Stage 2 (execution) gets re-run alongside BK-185's fix.

---


_Synced from Jira by sync-jira-issues_
