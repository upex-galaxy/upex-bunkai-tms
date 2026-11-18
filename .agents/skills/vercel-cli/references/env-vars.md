# Env-var management: sync `.env` and Vercel scopes

Vercel stores env vars per environment (Production, Preview, Development). The CLI is the practical way to bulk-sync them against your local `.env`; the dashboard takes one key at a time and loses values on copy-paste.

## Scope vocabulary

| CLI flag value | Dashboard label | Used for |
| --- | --- | --- |
| `production` | Production | The production branch (`git_strategy.branches.production`) |
| `preview` | Preview | Every other branch: feature branches, the integration branch, hotfixes |
| `development` | Development | Local `vercel dev` and `vercel env pull` to `.env.local` |

Use the lowercase CLI form in scripts. Dashboard labels are display-only.

## The env-var set for this boilerplate

`.env.example` is the source of truth for the key set. Every app-runtime key it declares must exist in both `production` and `preview` before a deploy can run. The table below is a snapshot to read alongside it. A key in `.env.example` that the table does not name follows the row of its family.

| Key | Scope | Source / notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | production + preview | Production: custom domain. Preview: leave blank (Vercel injects `VERCEL_URL`) or use `https://${VERCEL_URL}`. Local: `http://localhost:3000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | production + preview | Different Supabase project per env (staging vs prod). Browser-exposed. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production + preview | Browser-exposed. Legacy anon key. |
| `SUPABASE_URL` | production + preview | Server-side mirror of `NEXT_PUBLIC_SUPABASE_URL`. Some Supabase libs require both spellings. |
| `SUPABASE_ANON_KEY` | production + preview | Server-side mirror of the public anon key. |
| `SUPABASE_PUBLISHABLE_KEY` | production + preview | New-style publishable key. Browser-safe. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production + preview | Browser-side copy of the publishable key, read by the Supabase browser client. The integration does not provision it: set it by hand. |
| `SUPABASE_SECRET_KEY` | production + preview | New-style secret. Server-only, never `NEXT_PUBLIC_`. |
| `SUPABASE_SERVICE_ROLE_KEY` | production + preview | Legacy service-role key. Server-only. Bypasses RLS, so guard it. |
| `SUPABASE_JWT_SECRET` | production + preview | Used to verify and sign custom JWTs. |
| `POSTGRES_HOST` | production + preview | `db.<project-ref>.supabase.co` |
| `POSTGRES_USER` | production + preview | Usually `postgres` |
| `POSTGRES_PASSWORD` | production + preview | Supabase DB password |
| `POSTGRES_DATABASE` | production + preview | Usually `postgres` |
| `POSTGRES_URL` | production + preview | Pooled URL (port 6543) |
| `POSTGRES_URL_NON_POOLING` | production + preview | Direct URL (port 5432) |
| `POSTGRES_PRISMA_URL` | production + preview | Pooled + `pgbouncer=true`. Required if using Prisma. |
| `TAVILY_API_KEY` | production + preview *(optional)* | Only if app code calls Tavily at runtime. Devtime MCP-only usage does not need it in Vercel. |
| `ATLASSIAN_*`, `N8N_*` | (skip) | Devtime and agent-side only. Do not push these to Vercel scopes unless app code reads them at runtime. |
| `SUPABASE_ACCESS_TOKEN` | (skip) | Supabase MCP admin-scope PAT, devtime only. |

> **Shortcut:** the first-party Vercel + Supabase integration injects every `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*` and `POSTGRES_*` var into both scopes at once. See the "Copy Snippet" tip in `.env.example`. Once the integration is wired, `vercel env pull` is the source of truth and your local `.env` mirrors Vercel, not the other way round.

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

> Diff before you bulk-push. A blind push overwrites Vercel values that were different on purpose, such as the staging Supabase URL against the local one.

## Remove a key

```bash
vercel env rm NEXT_PUBLIC_APP_URL preview
vercel env rm NEXT_PUBLIC_APP_URL preview production    # multiple scopes
```

## Triggering a redeploy after env changes

Env changes do not redeploy by themselves. To pick up new values, do one of these:

- Push a no-op commit to the relevant branch.
- Run `vercel deploy --no-wait` from the linked directory.
- Use the dashboard: Deployments, "Redeploy" on the latest entry, with "Use existing Build Cache" unchecked when the vars are read at build time (most `NEXT_PUBLIC_*` cases).

## Hard rules

- Keep `.env.local` out of every commit. `vercel env pull` produces it and `.gitignore` excludes it for a reason.
- Never open `.env` or `.env.local`, and never print a value to diff or push it (Critical Rule #1). Diff names, and move values through the loader subprocess above (`agentic-dev-core/references/secret-hygiene.md`).
- Keep service-role and secret keys out of `NEXT_PUBLIC_*` names, because anything `NEXT_PUBLIC_` is bundled into the browser JS. The boilerplate's `NEXT_PUBLIC_SUPABASE_*` keys are deliberately the public publishable (or legacy anon) key only.
- Keep `ATLASSIAN_*`, `N8N_*` and `SUPABASE_ACCESS_TOKEN` out of Vercel scopes unless runtime app code reads them. They are devtime and agent-side credentials with no business in production runtime env.
- Re-run `vercel whoami` and check the `orgId` in `.vercel/project.json` before a bulk push. Pushing to the wrong team's project is the most common mistake.
- Treat `vercel env add` and `vercel env rm` on `production` as outward actions: run them when a person asked or the delegating brief covers them (`SKILL.md`, "Who approves what"). A routine with neither does the diff, lists the missing keys and stops.

## Reference

- `vercel env` docs: <https://vercel.com/docs/cli/env>
- Vercel-Supabase integration: <https://vercel.com/integrations/supabase>
- Build-time vs runtime env in Next.js: <https://vercel.com/docs/projects/environment-variables>
