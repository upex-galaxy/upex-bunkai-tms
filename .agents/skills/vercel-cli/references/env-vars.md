# Env-var management — sync `.env` ↔ Vercel scopes

Vercel stores env vars per **environment** (Production / Preview / Development). The CLI is the only sane way to bulk-sync these against your local `.env` — the dashboard is one-key-at-a-time and lossy on copy-paste.

## Scope vocabulary

| CLI flag value  | Dashboard label | Triggered for                                                                   |
| --------------- | --------------- | ------------------------------------------------------------------------------- |
| `production`    | Production      | The production branch (`git_strategy.branches.production`)                      |
| `preview`       | Preview         | Every other branch: feature branches, the integration branch, hotfixes          |
| `development`   | Development     | Local `vercel dev` / `vercel env pull` to `.env.local`                          |

Use the **lowercase CLI form** in scripts. Dashboard labels are display-only.

## The canonical env-var set for this boilerplate

`.env.example` is the source of truth for the key set. Every app-runtime key it declares MUST exist in BOTH `production` and `preview` scopes before a deploy will run successfully. The mapping below is a snapshot to read alongside it; a key in `.env.example` that the table does not name follows the row of its family:

| Key                                | Scope             | Source / notes                                                                                                                                          |
| ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`              | production + preview | Production: custom domain. Preview: leave blank (Vercel injects `VERCEL_URL`) or use `https://${VERCEL_URL}`. Local: `http://localhost:3000`.        |
| `NEXT_PUBLIC_SUPABASE_URL`         | production + preview | Different Supabase project per env (staging vs prod). Browser-exposed.                                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`    | production + preview | Browser-exposed. Legacy anon key.                                                                                                                       |
| `SUPABASE_URL`                     | production + preview | Server-side mirror of `NEXT_PUBLIC_SUPABASE_URL`. Some Supabase libs require both spellings.                                                            |
| `SUPABASE_ANON_KEY`                | production + preview | Server-side mirror of the public anon key.                                                                                                              |
| `SUPABASE_PUBLISHABLE_KEY`         | production + preview | New-style publishable key. Browser-safe.                                                                                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production + preview | Browser-side copy of the publishable key, read by the Supabase browser client. NOT provisioned by the integration: set it by hand.                  |
| `SUPABASE_SECRET_KEY`              | production + preview | New-style secret. **Server-only — never `NEXT_PUBLIC_`.**                                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`        | production + preview | Legacy service-role. **Server-only.** Bypasses RLS — guard it.                                                                                          |
| `SUPABASE_JWT_SECRET`              | production + preview | Used to verify / sign custom JWTs.                                                                                                                      |
| `POSTGRES_HOST`                    | production + preview | `db.<project-ref>.supabase.co`                                                                                                                          |
| `POSTGRES_USER`                    | production + preview | Usually `postgres`                                                                                                                                       |
| `POSTGRES_PASSWORD`                | production + preview | Supabase DB password                                                                                                                                     |
| `POSTGRES_DATABASE`                | production + preview | Usually `postgres`                                                                                                                                       |
| `POSTGRES_URL`                     | production + preview | Pooled URL (port 6543)                                                                                                                                  |
| `POSTGRES_URL_NON_POOLING`         | production + preview | Direct URL (port 5432)                                                                                                                                  |
| `POSTGRES_PRISMA_URL`              | production + preview | Pooled + `pgbouncer=true` — required if using Prisma                                                                                                    |
| `TAVILY_API_KEY`                   | production + preview *(optional)* | Only if app code calls Tavily at runtime. Devtime MCP-only usage does NOT need this in Vercel.                                                          |
| `ATLASSIAN_*`, `N8N_*`             | (skip)            | Devtime / agent-side only. Do NOT push these to Vercel scopes unless app code reads them at runtime.                                                    |
| `SUPABASE_ACCESS_TOKEN`            | (skip)            | Supabase MCP admin-scope PAT — devtime only.                                                                                                            |

> **Shortcut:** Vercel + Supabase have a first-party integration that auto-injects ALL `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, and `POSTGRES_*` vars into both scopes at once. See the "Copy Snippet" tip in `.env.example`. When that integration is wired, `vercel env pull` is the source of truth — your local `.env` mirrors Vercel, not the other way around.

## Read what Vercel has

```bash
# Pull preview-scope vars into .env.local (gitignored)
vercel env pull .env.local --environment=preview

# List names only (without secret values) — useful for diffing against .env.example
vercel env ls preview
vercel env ls preview --format json | jq -r '.envs[].key' | sort
```

## Write a single new key

```bash
# Interactive — prompts for the value
vercel env add NEXT_PUBLIC_APP_URL preview

# Non-interactive — pipe the value via stdin
echo "https://staging.example.com" | vercel env add NEXT_PUBLIC_APP_URL preview

# Multi-environment in one call
vercel env add NEXT_PUBLIC_APP_URL preview production
```

## Bulk push from local `.env` to Vercel Preview

```bash
# Pre-flight: confirm you're targeting the right project + team
vercel whoami
cat .vercel/project.json 2>/dev/null || cat .vercel/repo.json 2>/dev/null

# Diff documented keys against current Vercel preview keys (NAMES only:
# `.env.example` lists them; `.env` itself is never opened, Critical Rule #1)
LOCAL_KEYS=$(grep -oE '^[A-Z_][A-Z0-9_]+' .env.example | grep -vE '^(ATLASSIAN_|N8N_|SUPABASE_ACCESS_TOKEN$)' | sort -u)   # devtime credentials stay off Vercel (Hard rules)
REMOTE_KEYS=$(vercel env ls preview --format json | jq -r '.envs[].key' | sort -u)
comm -23 <(echo "$LOCAL_KEYS") <(echo "$REMOTE_KEYS")    # documented, not in Vercel

# Push each missing key (review the list FIRST — never blind-push). varlock
# reads .env inside a subprocess; `${!1}` expands the value by NAME and
# pipes it to Vercel, so it never reaches the terminal or the transcript.
for KEY in $(comm -23 <(echo "$LOCAL_KEYS") <(echo "$REMOTE_KEYS")); do
  bunx varlock run -- bash -c 'v="${!1}"; [ -n "$v" ] || { echo "skip $1 (empty in .env)"; exit 0; }; printf "%s" "$v" | vercel env add "$1" preview' _ "$KEY"
done
```

> **Always diff before bulk-pushing.** A blind push will overwrite Vercel values that were intentionally different from your local (e.g. staging vs local Supabase URLs).

## Remove a key

```bash
vercel env rm NEXT_PUBLIC_APP_URL preview
vercel env rm NEXT_PUBLIC_APP_URL preview production    # multiple scopes
```

## Triggering a redeploy after env changes

Env mutations do NOT automatically redeploy. To pick up new values:

- Push a no-op commit to the relevant branch, OR
- `vercel deploy --no-wait` from the linked directory, OR
- Dashboard → Deployments → "Redeploy" on the latest entry, with "Use existing Build Cache" UNCHECKED if env vars are read at build time (most `NEXT_PUBLIC_*` cases).

## Hard rules

- **NEVER commit `.env.local`** produced by `vercel env pull`. It's in `.gitignore` for a reason.
- **NEVER open `.env` / `.env.local` or print a value to diff or push** (Critical Rule #1). Diff NAMES; move values through the loader subprocess above (`agentic-dev-core/references/secret-hygiene.md`).
- **NEVER put service-role / secret keys in `NEXT_PUBLIC_*` names.** Anything `NEXT_PUBLIC_` is bundled into the browser JS. The boilerplate's `NEXT_PUBLIC_SUPABASE_*` keys are deliberately the public publishable (or legacy anon) key only.
- **NEVER push `ATLASSIAN_*`, `N8N_*`, `SUPABASE_ACCESS_TOKEN` to Vercel scopes** unless runtime app code reads them. These are devtime/agent-side credentials; they have no business sitting in production runtime env.
- **Always re-run `vercel whoami` and check `.vercel/project.json` `orgId`** before bulk-pushing. A misrouted push to the wrong team's project is the most common foot-gun.

## Reference

- `vercel env` docs: <https://vercel.com/docs/cli/env>
- Vercel-Supabase integration: <https://vercel.com/integrations/supabase>
- Build-time vs runtime env in Next.js: <https://vercel.com/docs/projects/environment-variables>
