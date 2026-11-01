# Migrations — ledger convention

This directory is the source of truth for the database schema. Every file is
named `NNNN_<slug>.sql` (zero-padded ordinal + snake_case slug) and is applied
to the remote Supabase project (`fmbpikzpkafptqximhxn`) via the Supabase MCP
`apply_migration` tool, which also records a row in
`supabase_migrations.schema_migrations` (the "ledger").

## Convention

1. **One ledger row per repo file.** The ledger row's `name` must equal the
   repo file's basename without extension (e.g. `0014_module_soft_delete`).
2. **Amend-in-place iterations must not mint new ledger rows.** While a
   migration is in flight (same PR, not yet merged), iterate by editing the
   repo file. If a re-apply to the remote is needed, repair the ledger
   afterwards so only one row per file survives (see repair log below).
3. **Never apply DDL via `execute_sql`** — it bypasses the ledger entirely and
   creates silent drift (objects exist remotely with no ledger row).
4. **`statements` holds the file content as applied.** After a ledger repair it
   is reset to the final file content; treat it as a mirror of the repo file,
   not an apply-by-apply history.

The Supabase CLI matches migrations by `version` (timestamp), not `name`, and
this repo's `NNNN_` file prefixes are not timestamp versions — so ledger `name`
hygiene is for human/AI auditability, not CLI interop.

## Repair log

### 2026-06-10 — BK-58: full ledger normalization

Drift repaired in one transaction (DML on `supabase_migrations.schema_migrations`
only; zero schema impact — remote objects already matched the repo end-state):

- **0014 triple-row collapse**: the BK-10 dev loop applied three iterations of
  `0014_module_soft_delete.sql` via `apply_migration`, minting three rows
  (`module_soft_delete`, `module_update_fn_param_defaults`,
  `module_update_fn_slug_guard`). The two amendment rows were deleted (their SQL
  is fully subsumed by the final file) and the surviving row
  (`20260604223445`) was renamed to `0014_module_soft_delete` with `statements`
  reset to the final file content.
- **Unprefixed names**: rows `module_move`, `user_story_uniqueness`,
  `atc_create_update` renamed to `0015_module_move`,
  `0016_user_story_uniqueness`, `0021_atc_create_update`.
- **Missing rows backfilled**: `0019_import_jobs` and
  `0020_import_jobs_one_active` existed remotely (table + index verified) but
  had no ledger rows (applied outside `apply_migration`). Backfilled with
  synthetic in-window versions `20260607000019` / `20260607000020` (between
  0018's and 0021's real versions) and `statements` = file content.

Post-repair state: 22 ledger rows, 1:1 with `0001`–`0022` repo files, all named
by basename.

### 2026-11-01 — BK-1169: 0109 re-apply collapsed to one row

`0109_workspace_coverage_report.sql` was applied, then amended in the same PR
(an explicit `qa_inspector_ro` revoke the 0085 default privilege made
necessary) and re-applied whole, minting a second row with the same name. The
first row (`20261101112125`, the pre-amendment content) was deleted; the
surviving row (`20261101112228`) holds the final file content byte for byte
(md5 match), and the live `prosrc` matches the file's function body.

### 2026-11-01 — BK-1555: 0111 re-apply collapsed to one row

`0111_user_story_archive_cascade.sql` was applied, then amended in the same PR
(the project lookup now goes through the story's module, because
`user_stories.project_id` is nullable) and re-applied whole, minting a second
row with the same name. The first row (`20261101200302`, the pre-amendment
content) was deleted; the surviving row (`20261101200450`) holds the final file
content byte for byte (md5 match), and the live `prosrc` matches the file's
function body.

### 2026-11-01 — BK-206: 0112 re-apply collapsed to one row

`0112_milestone_plans.sql` was applied, then amended in the same PR (the
readiness function's `frozen` flag is now `coalesce(..., false)`: a closed plan
with a NULL snapshot made it NULL and dropped the plan from both the frozen and
the live branch, caught by the DB-integration suite) and re-applied whole,
minting a second row with the same name. The first row (`20261101213717`, the
pre-amendment content) was deleted; the surviving row (`20261101214059`) holds
the final file content byte for byte (md5 match), and the live `prosrc` of all
three functions matches the file's function bodies.
