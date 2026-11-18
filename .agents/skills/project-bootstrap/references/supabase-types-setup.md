# Supabase types setup (add-on)

This add-on sets up types generated from the Supabase schema, so every database query is fully type-safe: autocomplete for tables and columns, compile-time errors, and `Row`, `Insert` and `Update` types for each table. It is an infrastructure add-on of `project-bootstrap` and runs on a greenfield project and on an existing app.

## Read the `stack:` block first

On an existing app the guard's verdict is `existing-app` (`SKILL.md` → Phase 3). Before the first step, read `.agents/project.yaml` → `stack:` (contract: `.agents/README.md` → `stack`) and resolve every literal this reference writes through it:

- The example paths (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) are the greenfield default. Resolve them under `{{stack.app_root}}`. The types file is `{{stack.database.types_path}}`, and with `stack.framework: nextjs-pages` the API lives in `pages/api/`.
- App commands are `{{stack.package_manager}} run <script>` with the script name from `stack.scripts`. A null script is skipped and said so, never invented. Dependencies install with that package manager, which is never changed.
- What the app already has wins. An existing docs UI, error contract, auth scheme, Supabase client location or major version of a dependency (Zod, Next) is read and extended, never replaced or upgraded by this add-on. When they conflict, show the user both shapes.
- The Supabase project ref is `environments.<env>.db_project_ref`, and any database touch follows `agentic-dev-core/references/db-change-doctrine.md`.

## Required input

Read these files:

- `package.json`: the Supabase dependencies.
- `src/lib/supabase/client.ts`: the current browser client, if there is one.
- `src/lib/supabase/server.ts`: the current server client, if there is one.
- `src/types/supabase.ts`: the current types, if they exist.
- `.agents/project.yaml` → `environments.<env>.db_project_ref` (`{{DB_PROJECT_REF}}` of the active environment): the Supabase project ref.

Preconditions, all required:

- Supabase is configured (from `backend-setup.md`).
- The tables exist in the database.
- The Supabase project ID is known.

## Tools

The Supabase MCP checks the connection and the schema. The Supabase CLI generates the types (`supabase gen types`). Check that the CLI is installed:

```bash
supabase --version
```

If it is not installed:

```bash
# macOS/Linux
brew install supabase/tap/supabase

# Or with npm
npm install -g supabase
```

## Output

Files:

- `src/types/supabase.ts`: types generated from the schema.
- `package.json`: the `db:types` script added.
- `src/lib/supabase/client.ts`: updated with the `<Database>` generic.
- `src/lib/supabase/server.ts`: updated with the `<Database>` generic.

## Steps

### Phase 0: Check the preconditions

**Step 0.1: Check the Supabase CLI**

Run `supabase --version` as in Tools above. When it is missing, show the install instructions.

**Step 0.2: Get the project ID**

Read it from `.agents/project.yaml` (`.agents/instructions/agent-project-variables.md` §7: the project's identity lives in the yaml):

```bash
yq '.environments.<env>.db_project_ref' .agents/project.yaml
```

If it is `null`, ask the user (and, with their OK, save the answer in that field):

```
What is your Supabase Project ID?

You can find it at:
https://supabase.com/dashboard/project/[YOUR_PROJECT]/settings/general

The project ref has this format: xxxxxxxxxxxxxxxxxxxx (20 characters)
```

Keep the project ID for the later steps. With nobody to ask, see "With nobody at the keyboard".

### Phase 1: Generate the Supabase types

**Step 1.0: Load the Supabase skills.** Load `/supabase` and `/supabase-postgres-best-practices` before generating. They cover the type generator, the `Database` type wiring and the schema the types mirror. If they are not installed, say so once, point at `bun setup` or at the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, and continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).

**Step 1.1: Run the generation**

When `stack.scripts.db_types` is not `null`, the app already has its generation script. Run `{{stack.package_manager}} run {{stack.scripts.db_types}}` and skip Step 3.2, because a second script must not be added. When it is `null`, generate into `{{stack.database.types_path}}` (greenfield default `src/types/supabase.ts`):

```bash
# Replace [PROJECT_ID] with the real value
bunx supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts
```

**Step 1.2: Check the generated file**

```bash
# Check that the file exists and has content
wc -l src/types/supabase.ts

# Check the basic structure
head -30 src/types/supabase.ts
```

Expected output:

```
✅ Types generated: src/types/supabase.ts
   - Lines: [number] (must be > 50)
   - Contains: Database type, Tables, Enums
```

**Step 1.3: Check the content**

The file must contain:

```typescript
export type Database = {
  public: {
    Tables: {
      [tabla_name]: {
        Row: { ... }
        Insert: { ... }
        Update: { ... }
      }
      // ... more tables
    }
  }
}
```

If the file is empty or has an error:

1. Check the connection to Supabase.
2. Check that the tables exist in the DB.
3. Check that the Project ID is right.

### Phase 2: Update the Supabase clients

**Step 2.1: Check the current `client.ts`**

Read `src/lib/supabase/client.ts` and look for the `<Database>` generic:

```typescript
// ✅ Correct - already has the generic
createBrowserClient<Database>(...)

// ❌ Wrong - the generic is missing
createBrowserClient(...)
```

**Step 2.2: Update `client.ts` (if needed)**

Before:

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

After:

```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

**Step 2.3: Update `server.ts` (if needed)**

Apply the same pattern:

```typescript
import type { Database } from '@/types/supabase'

// In the createServerClient function
return createServerClient<Database>(...)
```

**Step 2.4: Update `admin.ts` (if it exists)**

If `src/lib/supabase/admin.ts` exists:

```typescript
import type { Database } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';

export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
```

### Phase 3: Add the script to `package.json`

**Step 3.1: Read `package.json`**

```bash
cat package.json | grep -A5 '"scripts"'
```

**Step 3.2: Add the `db:types` script** (only when `stack.scripts.db_types` is `null`; afterwards, register the new name with `bun run agents:setup --stack`)

Edit `package.json` to add:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "db:types": "bunx supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts"
  }
}
```

**Step 3.3: Check the script**

```bash
bun run db:types
```

Expected output:

```
✅ db:types script added
✅ Runnable with: bun run db:types
```

### Phase 4: Final validation

**Step 4.1: TypeScript check**

```bash
bun run types:check
# Or: npx tsc --noEmit
```

If there are type errors:

- Check the `Database` imports.
- Check the path alias `@/types/supabase`.
- Regenerate the types if the schema changed.

**Step 4.2: Check type safety**

Write a test query to confirm autocomplete works:

```typescript
// In any Server Component
const supabase = await createServer();

// It should autocomplete table names
const { data } = await supabase
  .from('profiles') // ← table autocomplete
  .select('id, email'); // ← column autocomplete
```

Expected output:

```
✅ TypeScript check: PASSED
✅ Autocomplete working
✅ Row/Insert/Update types available
```

## With nobody at the keyboard

The general rule and the per-gate table are in `SKILL.md` → "With nobody at the keyboard". For this add-on:

- Project ID is `null` and nobody can answer: take it from the delegating brief when it gives one. Otherwise stop before Phase 1 and report the question, because there is nothing to generate types from.
- Writing the ref to `.agents/project.yaml`: a supervised worker needs its conductor's OK, and a routine writes only a value its brief supplied. With neither, leave the yaml untouched and put the value in the report.
- Supabase CLI missing: do not install it. Put the install instructions above in the report and stop, since the types cannot be generated without it.

## Final checklist

Files:

- [ ] `src/types/supabase.ts` exists and has the types of every table
- [ ] `src/lib/supabase/client.ts` uses the `<Database>` generic
- [ ] `src/lib/supabase/server.ts` uses the `<Database>` generic
- [ ] `package.json` has the `db:types` script

Validation:

- [ ] `bun run types:check` passes without errors
- [ ] `bun run db:types` regenerates the types correctly
- [ ] Autocomplete works in queries

## Final report

````markdown
# Supabase types setup completed

## Files created/updated:

- src/types/supabase.ts (generated)
- src/lib/supabase/client.ts (updated)
- src/lib/supabase/server.ts (updated)
- package.json (script added)

## Typed tables:

- [list the tables found in the schema]

## Available commands:

- `bun run db:types` - Regenerate the types after DB changes

## Usage:

```typescript
import type { Database } from '@/types/supabase';

// Type of a full row
type Profile = Database['public']['Tables']['profiles']['Row'];

// Type for inserting
type NewProfile = Database['public']['Tables']['profiles']['Insert'];

// Type for updating (everything optional)
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
```

## Next step:

Regenerate the types every time you change the DB schema:

```bash
bun run db:types
```

````

## FAQ

**When should I regenerate the types?** Every time the database schema changes (tables, columns or enums added or modified).

**What if the script fails?** Check three things:

1. The internet connection.
2. That the Project ID is right.
3. That the Supabase CLI is up to date (`npm update -g supabase`).

**Do the types include PostgreSQL functions?** Yes. RPC functions are typed automatically too.

**Can I edit `supabase.ts` by hand?** It is not recommended, because the next regeneration overwrites the changes. Put custom types in another file that imports from `supabase.ts`.

## Maintenance

After a schema change:

```bash
# 1. Regenerate the types
bun run db:types

# 2. Check TypeScript
bun run types:check

# 3. Commit
git add src/types/supabase.ts
git commit -m "chore: regenerate supabase types"
```

Optional CI/CD integration:

```yaml
# In your GitHub Actions workflow
- name: Verify Supabase Types
  run: |
    bun run db:types
    git diff --exit-code src/types/supabase.ts || echo "Types need regeneration!"
```
