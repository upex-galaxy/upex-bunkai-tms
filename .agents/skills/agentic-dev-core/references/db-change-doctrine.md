# DB change doctrine: schema work through the DB MCP

Shared reference for every workflow that changes a database: `project-bootstrap` (`backend-setup.md`, `supabase-types-setup.md`), story delivery (`sprint-development`), and the "delivery doctrine" `project-adoption` points at for the work that comes after an adoption. It covers how an agent changes a schema well; `mcp-capabilities.md` says which tool resolves capability `db`.

**The decision.** Agents apply database changes through the DB MCP (capability `db`: Supabase, or a server of the same Postgres family). The MCP is not a shortcut around a migration process. On Supabase it is the migration process, because `apply_migration` records every change in the project's migration history and `list_migrations` reads that history back. There is no hand-kept ledger file, and none is created anywhere in the repo, because the MCP history is the ledger. Two places never touch a database at all: the adoption install (`--adopt`) and `/project-adoption`, which only install and configure tooling.

---

## 1. Before the first change

1. **Load the stack skills**: `/supabase` and `/supabase-postgres-best-practices` (category `backend-db`) before the first schema, RLS, function or migration call. If they are not installed, say so once, point at `bun setup`, and continue (`skill-composition-strategy.md` §3.5).
2. **Name the target.** The project ref comes from `.agents/project.yaml` → `environments.<active_env>.db_project_ref`, not from memory or another doc. Say the environment out loud and have the user confirm it for this change before the first write. Production is a target only when the user names it; an earlier "use prod" does not carry over.
3. **Read the history first.** Before the first write in this session for this project, read `list_migrations` (what was applied, in order) and `list_tables` with `verbose` for every table the change touches. When `stack.database.migrations_dir` is set, read that directory too and compare it with the list: an entry in one and not in the other is drift. On drift, stop and report both sides. Re-applying a file or writing the missing one from memory only hides it.

## 2. How a change is applied

The route depends on `stack.database.migrations_tool` (the app's own answer to "how does a schema change land"):

| `migrations_tool` | The agent applies through | And also |
|---|---|---|
| `supabase-mcp` | `apply_migration` (snake_case name that says what changes) | nothing: the MCP history is the ledger |
| `supabase-cli` | `apply_migration`, same naming | writes the same SQL to `stack.database.migrations_dir` as `<version>_<name>.sql`, with the version read back from `list_migrations`, so files and history stay one record |
| `prisma` / `drizzle` | the app's tool generates the migration file; applying it is the team's pipeline, asked before running | the MCP stays read-only here: a change applied around the ORM never reaches its own migrations table, and the next deploy fights it |
| `none` / other | nothing until the user says how this app changes its schema | record the answer in the `stack:` block (`bun run agents:setup --stack`) |

- **DDL goes through `apply_migration` only.** That covers `CREATE` / `ALTER` / `DROP` of a table, column, index, view, function, trigger, enum, policy, and `ENABLE ROW LEVEL SECURITY`. `execute_sql` runs reads and data changes; DDL through it leaves no history entry, which is the drift this doctrine prevents.
- **Forward only.** An applied migration is not edited, deleted or re-run. Fix a mistake with a new migration that says so in its name.
- **One responsibility per migration**, the same rule as a commit. A table and its RLS can travel together; two unrelated tables do not.
- **Data changes** (seed rows, backfills) run through `execute_sql` on a non-production environment, after the user approves the exact rows. A backfill that production needs is a migration (DML inside `apply_migration`), so it lands in the history.
- **Destructive changes** (`DROP`, a rename other code reads, a type narrowing, a policy that removes access) need the user's explicit OK for that statement, quoted back before applying.
- **Read-only mode is a decision, not an obstacle.** `apply_migration` refuses in read-only mode. Report the refusal and do not work around it with `execute_sql`.

With nobody to ask, no confirmation above is assumed. Compose the change (and its file, when `migrations_dir` keeps one), stop before applying, and report what is waiting. `autonomous-delivery` decides under `migrations:` whether applying may run; `decision-protocol.md` covers the rest.

## 3. Verify at the destination

A `success: true` says the request was well formed (AGENTS.md Critical Rule #16). After every change:

1. `list_migrations` shows the new name.
2. The changed object reads back as intended (`list_tables` verbose, or a catalog `SELECT`).
3. After an RLS or function change, run the security advisors (`get_advisors`, when the server exposes it) and report every new finding.
4. Regenerate the types (`{{stack.scripts.db_types}}` when the app has that script, else `project-bootstrap` → `supabase-types-setup.md`) and check that the app type-checks.

## 4. Where the record lives

- Every migration is recorded in the MCP history (name and version). Story work also names it in the story's implementation plan and in the PR body, so a reviewer can find it.
- An architecturally significant migration gets an ADR when it passes all three gates of `adr-doctrine.md` (hard to reverse, surprising without context, a real trade-off). Typical cases: a tenancy or ownership model, an RLS model change (who may read what, across the app), a new auth-adjacent table, splitting or merging core entities, a destructive change with a backfill. The ADR's Context names the migration (`<version>_<name>`), the environments it was applied to, and the rollback statement; the Decision says why the schema has this shape. Routine additions (a column, an index, a lookup table) stay in the history and the PR only.
