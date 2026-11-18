# Backend and database setup

You are acting as a backend architect, database engineer and DevOps engineer. This reference builds the base backend (database, auth, API layer) once, so every MVP story reuses it. `frontend-setup.md` runs afterwards and consumes `src/types/supabase.ts` and the Supabase clients this reference produces.

## Entry gate: greenfield only

This reference only creates things (tables, RLS, seed data, Supabase clients, `src/lib/config.ts`, `middleware.ts`, dependency upgrades), so it must never run on an app that already exists. Confirm the guard verdict before any step (`SKILL.md`, "Entry gate", rule B0 (`compact_rules`)):

- `.session/project-bootstrap/plan.md` has the line `Bootstrap guard: greenfield, exit 0`: continue.
- There is no plan (a loose request, or a subagent that only has this reference): run `bun run bootstrap:guard`. Exit 0 continues. Exit 2 stops.
- The verdict is `existing-app`, unreadable or missing: stop without touching anything. Quote the signals the script printed, say what this phase would have overwritten, and route to `/project-adoption` (and to `/design-system extract` when the request was about how the UI looks). The add-ons of SKILL.md Phase 3 stay available and read the `stack:` block.

The script's verdict is the only verdict. Looking at the tree by hand does not replace it, and a user saying "it is greenfield" does not waive it.

## Inputs

Read these before starting:

- `.context/SRS/architecture-specs.md`: the critical one. Full ERD, tech stack, database schema.
- `.context/SRS/functional-specs.md`: functional requirements and features.
- `.context/SRS/non-functional-specs.md`: security and performance requirements.
- `.context/PRD/executive-summary.md`: project name and description.
- `.context/PRD/mvp-scope.md`: MVP epics and main functionality.
- `.agents/project.yaml`: project identity, stack, and `environments.<env>.db_project_ref` (the Supabase project ref, `{{DB_PROJECT_REF}}`).
- `package.json`: Next.js and React versions, existing dependencies.

The backend goes first. There is no frontend to analyse; if the repo already has code under `src/app/`, detect it so you do not overwrite it (B3), but do not use it as a data source.

Identify from the documents:

1. The full ERD: every table, relation and constraint.
2. The foundational tables: the ones the MVP epics need first, `profiles` for auth included. Not the whole ERD.
3. The user roles (admin, user, vendor, and so on), for the RLS policies.
4. The protected routes the PRD or SRS marks as authenticated. The middleware consumes them.
5. The seed data: the entities and volumes the PRD or SRS describes, so the frontend has real data to show.

## Tools

Two MCPs are required.

1. **Supabase MCP** creates tables and RLS policies and manages the database. If it is not available, stop the whole run.
2. **Context7 MCP** verifies packages and current APIs. Query it before installing any dependency.

### Required skills (load before installing anything or making any DB-MCP call)

`/supabase` and `/supabase-postgres-best-practices` (category `backend-db`): load both before Step 0.3 (CLI install) and before the first schema, RLS or migration call through the Supabase MCP. They carry the Supabase and Postgres rules (RLS shape, indexes, migration hygiene) this reference writes against. If they are not installed, say so once, point at `bun setup` (project-level list in `cli/install.ts`) or the single `bunx skills add` line from that list, and continue. Do not skip silently and do not stop (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).

Also needed: the Supabase CLI (installed in Step 0.3 if missing), a package manager (npm, yarn, pnpm or bun) and git.

Credentials needed:

- The Supabase project ref, from `.agents/project.yaml` key `environments.<env>.db_project_ref`. Ask the user only when it is `null`.
- The Supabase project URL, publishable key and secret key.

The canonical variable names are the ones in `.env.example`: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. The legacy pair (`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`) keeps working while Supabase provisions it.

## Scope and output

This runs once, before the feature sprints. Done means a working backend (database, auth, clients, types) that `frontend-setup.md` can consume.

In scope: the Supabase setup (project, credentials, CLI), the foundational tables, basic RLS, Supabase Auth (config, clients, session middleware), the API layer (typed Supabase clients), realistic seed data derived from the PRD and SRS, and the docs.

Out of scope: the full ERD, complex business logic, per-story features (those belong to the sprints), and multi-environment setup (dev, staging, prod).

| Output | Notes |
| --- | --- |
| `.env` | Real credentials, gitignored |
| `.env.example` | Descriptive template without credentials, committed |
| `src/lib/config.ts` | Centralised configuration with validation |
| `src/lib/supabase/client.ts` | Browser client with `@supabase/ssr` |
| `src/lib/supabase/server.ts` | Server client for Server Components |
| `src/lib/supabase/admin.ts` | Optional admin client with the secret key |
| `middleware.ts` | Route protection and session refresh |
| `src/types/supabase.ts` | Types generated from the database schema |
| `.context/backend-setup.md`, `.context/api-auth.md` | Setup and API auth docs |
| In Supabase | Foundational tables, RLS policies, indexes, seed data |
| Dependencies | `@supabase/ssr` and `@supabase/supabase-js` upgraded |

## Rules

- Create only the tables the MVP needs now. Extra tables are speculative and the ERD keeps growing with the sprints.
- Read project values from the context, never hardcode them (B4).
- Run DDL through the Supabase MCP under `agentic-dev-core/references/db-change-doctrine.md`: `apply_migration` for DDL, never `execute_sql`. Do not write manual SQL scripts.
- Do not write complete code in the plan. Use pseudocode plus Context7, and check versions there before using any example code. Never assume package names or imports.
- Query Context7 before installing or using any dependency.
- Check `git status` before writing, so unsaved work is not overwritten.
- Check for an existing env file and ask the user about the strategy before creating `.env` files.
- Do not commit automatically. Recommend the commit.
- Check the Next.js and React versions first, because they change the Supabase setup.
- Centralise env access in a config file, add indexes for the expected queries, apply basic RLS from the start, and generate TypeScript types with the Supabase CLI.
- Validate that the clients, middleware and types compile against the real database.

## Workflow

Each part ends with a checkpoint.

## Part 0: Validations and setup

Goal: every tool is available.

### Step 0.0: Check git state

Run `git status` before anything else, to avoid overwriting unsaved work.

```bash
git status
```

- Uncommitted changes: warn the user clearly, list the modified files, and ask "You have uncommitted changes. Do you want to continue anyway?" Suggest a commit or `git stash` first.
- Clean repo: continue without warnings.
- Not a git repo: warn only (it does not block) and suggest `git init` for a new project.

Expected output:

```
Git status checked
   - State: [clean / pending changes / not a git repo]
   - [Warnings if any]
```

### Step 0.1: Check the Supabase MCP

If it is not available, stop the whole run. List the available MCP tools and look for the Supabase MCP. If it is missing, report:

```
STOPPING

Supabase MCP NOT available

This reference needs the Supabase MCP to create tables, RLS and manage the database.

Please:
1. Configure the Supabase MCP in your environment
2. Restart and run this step again

Docs: [link to the Supabase MCP docs]
```

If it is available, continue.

### Step 0.2: Resolve the Supabase project ref

Read `.agents/project.yaml` key `environments.<env>.db_project_ref` (`{{DB_PROJECT_REF}}` of the active environment) first. If it has a value, use it without asking.

Only when it is `null`, ask "What is your Supabase project ref?" with two options:

1. I have an existing project: ask for the ref.
2. I need to create a new project: show the instructions.

Save the ref in `.agents/project.yaml` (`environments.<env>.db_project_ref`) with the user's OK. It never goes in `AGENTS.md` or in a separate file (`.agents/instructions/agent-project-variables.md` §7).

### Step 0.3: Check the Supabase CLI

```bash
supabase --version
```

If it is not installed, get the current install command from Context7, ask "Can I install it for you?", then run the install or show the manual instructions.

Output:

```
Supabase CLI: v[version]
Supabase MCP available
Project ID: [project-id]
```

### Step 0.4: Detect the env-var strategy

Getting this wrong causes hard-to-trace errors, so settle it first.

1. List the existing env files:

   ```bash
   ls -la | grep -E "^\.env"
   ```

2. Read the files found.
3. Ask the user: "I detected [files]. How do you want to manage the Supabase variables?" Options: (a) use the existing `.env`, (b) use `.env` (Next.js standard), (c) a centralised config file.
4. Implement the chosen strategy.

Output:

```
Strategy: [chosen]
Files to update: [list]
```

### Step 0.5: Check the stack versions

Compatibility depends on these.

1. Read `package.json` for Next.js, React and TypeScript.
2. Query Context7: "Supabase auth Next.js [version] React [version] latest setup", and identify the right packages for those versions.
3. Record the decision:

   ```
   Detected versions:
   - Next.js: [version]
   - React: [version]

   Packages to use:
   - @supabase/ssr@[version] (verified with Context7)
   - @supabase/supabase-js@[version]

   Reason: [explain compatibility]
   ```

Output:

```
Stack analysed
Packages verified with Context7
Compatibility confirmed
```

## Part 1: Context analysis

Goal: understand the project and decide which tables to create.

### Step 1.1: Read the project docs

Read `.context/SRS/architecture-specs.md` (full ERD, tech stack), `.context/SRS/functional-specs.md` (functional requirements) and `.context/PRD/mvp-scope.md` (main functionality). Identify the five items listed under Inputs, and keep the seed data to the entities, volumes and realistic ranges the PRD or SRS describes.

Keep the results internal (do not show them): the complete ERD, the foundational tables to create, and the seed plan per entity.

### Step 1.2: Query the official docs (Context7 MCP)

Do this before any implementation, and write no code until all queries are done.

1. "Supabase JavaScript client Next.js [version] App Router latest package"
2. "Supabase Auth Next.js [version] App Router setup authentication"
3. "Supabase Next.js [version] middleware authentication refresh session"
4. "Supabase Row Level Security policies best practices"
5. "Supabase CLI generate types TypeScript command"
6. "Next.js [version] environment variables best practices"
7. If Next.js 15 or later: "Next.js 15 cookies async breaking changes"

Then show the user:

````markdown
## Analysis complete

### ERD identified:

- Tables in the SRS: [number]
- Foundational tables to create: [list with reason]

Example:

```pseudocode
- `profiles` - Required by: auth
- `[core_entity]` - Required by: [MVP epic]
```

### Seed data plan:

```pseudocode
- [entity1]: [X] records (source: [PRD/SRS section])
- [entity2]: [Y] records, linked to [entity1]
```

### Verified technical stack:

- Framework: Next.js [version] (App Router)
- Database: Supabase PostgreSQL
- Auth: Supabase Auth
- Client: @supabase/ssr@[version] (verified with Context7)

### Decisions:

- Package: @supabase/ssr (not auth-helpers, which is deprecated)
- Cookies: [async/sync depending on version]
- Env vars: [strategy from Step 0.4]
````

## Part 1.5: Install dependencies

Goal: install the packages Context7 verified.

### Step 1.5.1: Check existing dependencies

1. Read the whole `package.json`.
2. Look for conflicts: `@supabase/auth-helpers-nextjs` exists, remove it (deprecated). `@supabase/supabase-js` exists, check its version.
3. Show the plan:

```
Dependency plan:

To remove:
- @supabase/auth-helpers-nextjs (deprecated)

To install:
- @supabase/ssr@[version]
- @supabase/supabase-js@[version]
```

### Step 1.5.2: Install the verified dependencies

```bash
# Remove deprecated dependencies (if present)
[package-manager] remove @supabase/auth-helpers-nextjs

# Install current stable versions
[package-manager] add @supabase/ssr@latest @supabase/supabase-js@latest
```

Validate the installed versions:

```bash
[package-manager] list | grep supabase
```

Expected output:

```
Supabase dependencies installed:
   - @supabase/ssr@0.x.x (stable)
   - @supabase/supabase-js@2.x.x (stable)
Deprecated removed: @supabase/auth-helpers-nextjs

Installed versions:
   @supabase/ssr: ^0.x.x
   @supabase/supabase-js: ^2.x.x

If the versions differ:
   - Check compatibility with Context7
   - Make sure @supabase/ssr is 0.x or later (not alpha/beta)
   - Make sure @supabase/supabase-js is 2.x or later (not 1.x)
```

Additional compatibility check:

```bash
# Check the Next.js version
[package-manager] list next

# Validated compatibility:
# - Next.js 15.x + @supabase/ssr 0.x OK
# - Next.js 14.x + @supabase/ssr 0.x OK
# - Next.js 13.x + @supabase/ssr 0.x OK
```

## Part 2: Database schema

Goal: create the foundational tables through the Supabase MCP.

### Step 2.0: Read the history before writing

The doctrine is `agentic-dev-core/references/db-change-doctrine.md`. With `/supabase` and `/supabase-postgres-best-practices` loaded:

1. Run `list_migrations` on the project ref from Step 0.2. A greenfield project has an empty history, or only what the user applied by hand. If it holds migrations this session does not know, stop and show them to the user: the database is not new.
2. Run `list_tables` (verbose) to confirm the tables you are about to create do not exist.
3. State the environment and the ref out loud before the first write.

### Step 2.1: Create the foundational tables

Use the Supabase MCP, not manual SQL scripts. Each schema change (a table with its indexes, or one table's RLS) is ONE migration through `apply_migration`, with a snake_case name that says what changes, so it appears in the history (`list_migrations`). `execute_sql` never carries DDL. If `stack.database.migrations_tool` is `supabase-cli`, write the same SQL also into `stack.database.migrations_dir` as `<version>_<name>.sql` (version read from `list_migrations`).

For each foundational table:

```
For table [TABLE_NAME] from the ERD:

  1. Prepare the definition:
     - Name: [table_name] (snake_case)
     - Columns: [per ERD + timestamps]
     - PK: id (uuid, gen_random_uuid())
     - FKs: [per relations]
     - Constraints: [unique, not null, defaults]

  2. Create via the Supabase MCP, as a recorded migration:
     MCP_CALL: apply_migration(name: "create_[table_name]", query: [DDL])

  3. Validate at the destination:
     list_migrations shows "create_[table_name]"; list_tables (verbose) shows the table
```

Conventions:

```pseudocode
- snake_case: `user_profiles`, `[entity]_[subentity]`
- UUID for IDs: `gen_random_uuid()`
- Timestamps: `created_at TIMESTAMPTZ DEFAULT now()`
- Soft deletes (if applicable): `deleted_at TIMESTAMPTZ`
```

Output per table:

```
Table `[table_name]` created
   - Columns: [number]
   - PKs: id
   - FKs: [list]
   - Indexes: [list]
```

### Step 2.1.5: Optimise with indexes

Add indexes from the start, for performance. For each table, consider indexes on:

- Frequently searched columns (email, username, slug)
- Foreign keys (automatic in some cases)
- Sort fields (created_at, rating, price)
- Filter fields (status, category, is_active)

```
For each table:
  Analyse the frontend's expected queries

  IF a column is often used in WHERE/ORDER BY:
    Create an index: CREATE INDEX idx_[table]_[column] ON [table]([column])

  IF a column is an FK:
    Check that the index exists (it should be automatic)

  Document which indexes were created and why
```

Output:

```pseudocode
Optimised indexes:
   - profiles.email (login lookups)
   - [entity_table].[sort_column] (sorting)
   - [entity_table].[fk_column] (FK + filters)
```

### Step 2.2: Configure Row Level Security (RLS)

For each table created:

```
1. Enable RLS (DDL: goes through apply_migration, never execute_sql):
   MCP_CALL: apply_migration(name: "rls_[table_name]", query: "ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ...")

2. Create policies by table type:

   IF public table (catalogs, listings):
     POLICY: SELECT allowed for everyone

   IF authenticated table (profiles, user data):
     POLICY: SELECT only authenticated
     POLICY: INSERT only authenticated
     POLICY: UPDATE only if user_id = auth.uid()
     POLICY: DELETE only if user_id = auth.uid()

   IF admin table (configuration, reports):
     POLICY: SELECT only if role = 'admin'
     POLICY: INSERT/UPDATE/DELETE only admin

3. Validate the policies:
   Test with a simulated query
   get_advisors (security), if the MCP exposes it: report every new finding
```

ADR: the foundational schema and its RLS model (who reads what across the whole app) pass all three gates of `adr-doctrine.md` (hard to reverse, surprising without context, a real trade-off). Record an ADR that names the migrations (`<version>_<name>` from `list_migrations`), the environment where they were applied, and the rollback statement (`db-change-doctrine.md` §4).

Security checklist:

- [ ] Can users read other users' data? If they should not, the policy is restrictive.
- [ ] Are the policies as restrictive as possible?
- [ ] Is the secret key never exposed in the frontend?

Output:

```
RLS configured on [table_name]
   - SELECT: [public/authenticated/own]
   - INSERT: [description]
   - UPDATE: [description]
   - DELETE: [description]

Security verified:
   - Restrictive policies applied
   - No data leaks identified
```

### Step 2.3: Seed data

Goal: the frontend, scaffolded later, has real, believable data from day one.

```
1. Derive the seed plan from the PRD/SRS (Part 1):
   - Foundational entities and their relations
   - A reasonable volume per entity for a demo
   - Realistic ranges and values for the domain

2. Ask the user:
   "I propose [X] [entity1], [Y] [entity2] as seed data.
    Should I create it in the DB?"

   Options:
   a) Yes, the proposed plan (recommended)
   b) Create the minimum (2-3 records per table)
   c) No, leave the tables empty

3. IF the user chooses (a):
   For each entity:
     - Create the records in the plan
     - Keep data types realistic (real-looking names, fitting values)
     - Preserve relations (valid FKs)

4. IF the user chooses (b):
   Create 2-3 basic records per table
   Enough to validate queries

5. Insert via the Supabase MCP (DML, only in a non-production environment, with the records the user approved):
   MCP_CALL: execute_sql(INSERT ...)

6. Validate the insert:
   Query to confirm the data is in the DB
```

Output:

```pseudocode
Seed data created:
   - profiles: [N] records
   - [entity1]: [X] records
   - [entity2]: [Y] records (linked to [entity1])

Generated data:
   - Realistic [attributes] (no Lorem Ipsum)
   - Valid relations (correct FKs)
```

## Part 3: Auth integration

Goal: Supabase Auth configured on the server side: clients, config and session middleware. The auth UI (login, signup) is built by `frontend-setup.md` on top of these clients.

### Step 3.1: Configure Supabase Auth

Give the user these instructions for the Supabase Dashboard:

1. Check that Email Auth is enabled.
2. Set the redirect URLs: `http://localhost:3000/**`
3. Optional: OAuth providers, if the PRD mentions them.

### Step 3.2: Create the centralised config file

File: `src/lib/config.ts`

In Next.js, `NEXT_PUBLIC_*` variables are replaced statically at build time. Dynamic access such as `process.env[variableName]` does not work in the browser. Always read them directly: `process.env.NEXT_PUBLIC_SUPABASE_URL`.

```
Create a config file that:
1. Imports process.env variables with DIRECT STATIC ACCESS
2. Exports typed constants
3. Validates that the required variables exist
4. Throws descriptive errors if they are missing
5. (Optional) Logs in development without exposing secrets

Structure:
- supabaseUrl: NEXT_PUBLIC_SUPABASE_URL
- supabasePublishableKey: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- supabaseSecretKey: SUPABASE_SECRET_KEY (server only)
- appUrl: NEXT_PUBLIC_APP_URL

Validations:
- throw Error if supabaseUrl is missing
- throw Error if supabasePublishableKey is missing

CORRECT:
  export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

INCORRECT:
  const getEnv = (key: string) => process.env[key]  // does NOT work in the client
  export const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL')
```

Output:

```
Config created: src/lib/config.ts
Validations included
Type-safe exports
```

### Step 3.3: Update the environment files

Follow the strategy chosen in Step 0.4.

```
IF strategy = "use existing .env":
  Add the variables to .env:
  - NEXT_PUBLIC_SUPABASE_URL=...
  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
  - SUPABASE_SECRET_KEY=...

IF strategy = "use .env":
  Create/update .env with the variables

ALWAYS:
  Check that .env.example already declares these variables (they ship in the template).
  Never rewrite it: it stays in parity with cli/lib/variables-manifest.ts.
  A new variable goes in .env.example AND in the manifest (see Step 6.3).
```

Show the user:

```
Environment variables configured
   - File: .env
   - Template: .env.example checked (not rewritten)

ACTION REQUIRED:
   Add your real credentials to the [.env] file

   Get the credentials:
   1. https://supabase.com/dashboard/project/[PROJECT_ID]/settings/api
   2. Copy: URL, publishable key, secret key
   3. Paste them into your env file
```

The user types the secret values. You never read, print or paste them.

### Step 3.4: Create the Supabase clients

Use code verified with Context7. `config.ts` is imported on both the client and the server, so the public variables (`NEXT_PUBLIC_*`) must use direct static access, never a helper that reads `process.env` dynamically.

1. Browser client, `src/lib/supabase/client.ts`:

   ```
   Import:
   - createBrowserClient from @supabase/ssr
   - Database type from @/types/supabase
   - Config from ../config

   Export function createClient():
     Return: createBrowserClient<Database>(supabaseUrl, supabasePublishableKey)

   NOTE: verify the API with Context7 (it may change by version)
   ```

2. Server client, `src/lib/supabase/server.ts` (Next.js 15 or later, async cookies):

   ```
   Import:
   - createServerClient from @supabase/ssr
   - cookies from next/headers
   - Database type, config

   Export async function createServer():
     cookieStore = await cookies()  // async in Next.js 15+

     Return createServerClient<Database>(url, key, {
       cookies: {
         getAll(): cookieStore.getAll(),
         setAll(cookies):
           try {
             cookies.forEach -> cookieStore.set()
           } catch {
             // Ignore if called from a Server Component
           }
       }
     })

   NOTE: on Next.js 13-14, cookies() is sync (no await)
   ```

3. Optional admin client, `src/lib/supabase/admin.ts`:

   ```
   Create only if needed (bypasses RLS)
   Use the secret key (`SUPABASE_SECRET_KEY`)
   Warn: NEVER use it in the frontend
   ```

Output:

```
Supabase clients created:
   - client.ts (browser)
   - server.ts (server components)
   - [admin.ts] (optional)
They import the centralised config
Typed with Database
```

### Step 3.5: Create the middleware

File: `middleware.ts` (repo root)

```
Import: createServerClient, NextResponse

Function middleware(req):
  1. Create the initial response: NextResponse.next()

  2. Create the Supabase client with the request's cookies:
     - getAll() from req.cookies
     - setAll() updates req and response cookies

  3. Get the session: supabase.auth.getSession()

  4. Define the protected routes (from the Part 1 analysis):
     protectedRoutes = ['/[protected_route_1]', '/[protected_route_2]', ...]

  5. Redirect logic:
     IF there is no session AND the route is protected:
       Redirect to /login with param ?redirect=[route]

     IF there is a session AND the route is /login or /signup:
       Redirect to /[main_route]

  6. Return the response with updated cookies

Matcher config:
  Exclude: _next/static, _next/image, favicon, assets
```

Output:

```
Middleware created
   - Automatic session refresh
   - Protected routes: [list]
   - Redirects configured
```

### Step 3.6: Hand the auth over to the frontend

This reference creates no AuthContext and refactors none: there is no frontend yet. It hands over what `frontend-setup.md` needs for its login page (built on `supabase.auth.signInWithPassword()`):

```
src/lib/supabase/client.ts and server.ts ready
middleware.ts refreshing the session
Protected routes listed (Part 1) for the middleware
```

## Part 5: Types and validation

Goal: generate the TypeScript types and validate the integration.

Next.js does not pick up env-var changes during development. After editing `.env`, clear the cache and restart:

```bash
rm -rf .next && [package-manager] run dev
```

### Step 5.1: Check the dependency versions

Validate before generating types, to make sure Next.js and Supabase are compatible.

```bash
[package-manager] list | grep -E "(next|react|supabase)"
```

Expected output (an example; the real versions are what the command prints):

```
Validated versions:

Base stack:
- next: 15.x.x (stable)
- react: 19.x.x (stable)
- react-dom: 19.x.x (stable)

Supabase stack:
- @supabase/ssr: 0.x.x (stable)
- @supabase/supabase-js: 2.x.x (stable)

If a version does NOT match:
1. Query Context7 MCP: "[package] latest stable version compatibility"
2. Update: [pm] add [package]@latest
3. Re-run this validation

Critical compatibility checked:
- Next.js 15.x + @supabase/ssr 0.x: async cookies compatible
- React 19.x + Next.js 15.x: officially compatible
```

### Step 5.2: Generate the Supabase types

Verify the command with Context7:

```bash
supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts
```

Validate that the file `src/types/supabase.ts` exists, contains the types of all tables, has no syntax errors and is not empty. Then explain:

```
Types generated: src/types/supabase.ts

Contains:
- Table interfaces
- Row, Insert and Update types
- DB enums
- Type safety in queries

Usage:
import { Database } from '@/types/supabase'
type [Entity] = Database['public']['Tables']['[table_name]']['Row']

Regenerate the types every time the schema changes:
   supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts
```

### Step 5.3: Validate TypeScript

```bash
[package-manager] run types:check
# Or: npx tsc --noEmit
```

Check for no TypeScript errors, correct imports, a valid `config.ts` and reachable Supabase types. On errors, review and fix.

Common problems:

```markdown
Error: Cannot find module '@/types/supabase'
- Check that the file exists
- Check the @ alias in tsconfig.json

Error: Property 'X' does not exist on type 'Database'
- Regenerate the types (the schema changed)
- Check the table name is lowercase/snake_case
```

### Step 5.4: Validate the full build

```bash
[package-manager] run build
```

Check for a successful build, no env-var warnings, a middleware that compiles, and Server Components without cookie errors. On errors, analyse, fix and document.

Common problems:

```markdown
Error: cookies() expects to be called within a request scope
- Check that you use await cookies() on Next.js 15
- Correct code: const cookieStore = await cookies()

Error: Environment variables missing
- Check that .env exists
- Check that config.ts reads correctly
- Check the names: NEXT_PUBLIC_SUPABASE_URL (with the prefix)

Error: Module not found '@supabase/ssr'
- Reinstall: [pm] add @supabase/ssr@latest
- Clear the cache: rm -rf node_modules && [pm] install
```

Expected output:

```
Versions validated (Next 15 + Supabase SSR 0.x)
TypeScript validated (no errors)
Production build successful
Ready for development
```

## Part 6: Documentation

Goal: document the setup for the team.

### Step 6.1: Create backend-setup.md

File: `.context/backend-setup.md`. Structure:

```markdown
# Backend Setup - [Project]

## Database Schema

[Table by table: purpose, columns, relations, RLS]

## Authentication

[Provider, flow, key files]

## API Layer

[Packages, config, clients, usage]

## Environment Variables

[Strategy, how to get them, validation]

## Useful Commands

[Regenerate types, build, dev, etc.]

## Troubleshooting

[Common errors and solutions]

## Next Steps

[Features to implement, suggestions]
```

### Step 6.2: Create api-auth.md

File: `.context/api-auth.md`. Structure:

```markdown
# API Authentication - [Project]

## Authentication Methods

- Supabase Auth (cookie-based sessions)
- Authentication flow (signup, login, session)

## For Developers

### Access the authenticated user in API routes

[Example code with getAuthenticatedUser()]

### Protect endpoints

[Use of middleware and RLS]

### Auth in components

[How to read the session from Server Components (server client) and Client Components (browser client)]

## For QA/Testing

### Authentication when testing APIs

- Protected APIs require valid session cookies
- Log in via the web: the cookies are set automatically
- For Postman: copy the cookies from DevTools

### Get tokens for manual testing

1. Log in to the web application
2. Open DevTools, Application, Cookies
3. Copy the relevant `sb-*` cookies

### Testing with DevTools

[Instructions for the Network tab]

## Security Considerations

- RLS policies applied to every table
- NEVER expose the secret key in the frontend
- Validate permissions in every endpoint
```

Endpoint documentation (routes, parameters, responses) lives in OpenAPI plus Scalar UI (`/api/docs`) when `openapi-setup.md` was run.

### Step 6.3: Check .env.example (do not rewrite it)

`.env.example` already ships the Supabase block and stays in parity with `cli/lib/variables-manifest.ts` (`scripts/check-vars.ts` fails if they diverge). Rewriting it with your own block would delete the template's other variables.

- Check that it declares `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
- If the backend adds a variable the template lacks, add it to `.env.example` AND to `cli/lib/variables-manifest.ts`, in the same commit.

## Part 7: Final report

### Step 7.1: Executive summary

Show the user:

````markdown
# BACKEND SETUP COMPLETE

## Implemented

### 1. Database Schema

Tables created: [number]
[List with purpose]

### 2. Row Level Security

- RLS enabled
- Policies configured
- Security validated

### 3. Authentication

- Supabase Auth with @supabase/ssr
- Protection middleware

### 4. API Layer

- Clients configured
- Centralised config: src/lib/config.ts

### 5. Seed Data

- [x] records created
- Realistic data

### 6. TypeScript

- Types generated: src/types/supabase.ts
- Build validated

### 7. Documentation

- .context/backend-setup.md
- .context/api-auth.md
- .env.example checked

---

## Immediate next steps

### 1. Configure the variables (NOW)

```bash
cp .env.example .env  # (or .env)
```

Edit it and add the credentials from:
https://supabase.com/dashboard/project/[PROJECT_ID]/settings/api

src/lib/config.ts validates them automatically.

---

### 2. Test the integration (NOW)

```bash
[package-manager] run dev
```

Checklist:

1. The app starts with no env errors
2. A query with the server client returns the seed data
3. The middleware redirects work on a protected route
4. Signup, login and logout get tested once `frontend-setup.md` creates the login page

---

### 3. Verify the database (RECOMMENDED)

1. https://supabase.com/dashboard/project/[PROJECT_ID]/editor
2. See the tables created
3. See the seed data inserted
4. Check the user in auth.users after a signup

---

### 4. Commit (RECOMMENDED)

Do it with `/git-flow-master` (explicit paths, never `git add .`). Suggested message:

```
feat: Supabase backend setup

- Database schema with [X] tables
- RLS policies configured
- Auth with @supabase/ssr + session middleware
- Centralised config
- Realistic seed data
- Full documentation
```

### 5. Next phase

Frontend setup (`frontend-setup.md`) consumes `src/types/supabase.ts` and the clients from this reference. It requires `DESIGN.md` (B5).

---

## Final stack

- Next.js [version] (App Router)
- Supabase PostgreSQL
- @supabase/ssr@[version]
- TypeScript with full type safety
````

## Final checklist (internal, do not show the user)

- [ ] Git status checked, Supabase CLI installed, Supabase MCP and Context7 MCP available
- [ ] Context7 queried before installing; `@supabase/ssr` installed (not auth-helpers), deprecated packages removed, compatibility verified
- [ ] Foundational tables created, indexes added, RLS configured and checked, realistic seed data inserted
- [ ] Env strategy agreed with the user, `config.ts` created and validating, `.env.example` checked
- [ ] Supabase Auth configured, middleware in place, clients configured (server client async on Next.js 15 or later)
- [ ] TypeScript check and build pass with no env-var errors
- [ ] `backend-setup.md` and `api-auth.md` written, troubleshooting included

## With nobody at the keyboard

This reference asks the person at six points: a dirty git tree (Step 0.0), the project ref when it is `null` (Step 0.2), the CLI install (Step 0.3), the env strategy (Step 0.4), the seed choice (Step 2.3) and the credentials the user pastes (Step 3.3). The rules for who decides are in `agentic-dev-core/references/decision-protocol.md`.

- A person is present: ask as written above.
- A supervised worker: the conductor that launched you answers. Send the question to it and wait.
- A routine with nobody: the delegating brief is the approval source. If it names the project ref, the environment and the seed option, those answers stand and you may write to the database. Without a brief that covers them, do the local, reversible work (reading the context, the env-var strategy that keeps the existing file, `config.ts`, clients, middleware), stop before the first `apply_migration` or `execute_sql`, and report what is waiting. A dirty git tree, a missing Supabase MCP, a non-empty migration history and an `existing-app` verdict stop the run in every mode.
