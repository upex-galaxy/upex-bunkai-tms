# Environment configuration (Stage 4, once per project)

Gives each environment (development, staging, production) its own variables on the platform that serves it, so no environment borrows another's values. Run it after `ci-cd-setup.md` and before the first `staging-deploy.md`.

## What to read first

- `.agents/project.yaml`, `environments` (critical): the URL per environment. Credentials live in `.env`, never in a doc.
- `.env.example`: the template of the variables the app needs.
- `package.json`: the framework (Next.js and so on).
- Whether `.env` exists. List the file names only. Never open `.env` or print a value from it (Critical Rule 1).

From these, identify which cloud services the app uses (Supabase, Vercel and so on), which variables it needs (database, auth, external APIs) and which hosting provider serves it (Vercel, Railway, Netlify). No MCP is needed. You need access to the Vercel or Railway dashboard, and optionally the host's CLI.

## What is in and out

In scope:

- Development: variables in `.env` for local work.
- Staging: variables on Vercel or Railway, scope "Preview", pointing at staging services (a staging Supabase project and so on).
- Production: only the structure, documented but not configured. That is Stage 5.
- A check that no secret is hardcoded in the code.

Out of scope: configuring production fully, and third-party secrets for services not integrated yet (they are added when the integration lands).

Outputs: `.env.example` updated with every variable the app needs, staging variables set on the platform, and `.context/environment-variables.md` documenting what each variable is for. `.env` stays gitignored.

## Rules

- No hardcoded values: everything comes from environment variables. Only `.env.example` is committed, never a real secret.
- Secret keys stay server-side. The `NEXT_PUBLIC_` prefix is only for what the browser may see (URLs, publishable keys), and a secret key never gets it.
- Each environment has its own values. Do not reuse one environment's values in another.
- The values are the human's to type (Critical Rule 1): into `.env`, into the Vercel or Railway dashboard. You write the structure, the names and the documentation, never a secret value.
- Do not configure production yet.
- Validate before you call it done: build and run with the staging variables.

## Step 1: identify the variables

Read `.env.example` and `.agents/project.yaml`, `environments`. Classify:

1. Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` (server-only). The canonical names are those in `.env.example`. The legacy Supabase pair (`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`) keeps working while Supabase provisions it, but the boilerplate uses publishable plus secret.
2. Vercel: `NEXT_PUBLIC_APP_URL`.
3. Third-party APIs when the app uses them (Stripe, SendGrid and so on).

Report them to the user:

```markdown
## Variables identified

### Core (Supabase)

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key (public)
- `SUPABASE_SECRET_KEY`: secret key (server-only)

### App

- `NEXT_PUBLIC_APP_URL`: base URL of the application

### Third-party (if any)

- [list per project]

Total: [X] variables to configure
```

## Step 2: development (local)

Make sure `.env` has every variable. If it does not exist, create it from the template:

```bash
ls -la | grep .env
cp .env.example .env
```

Then tell the user to fill it in:

````markdown
## Configure `.env` (development)

1. Open `.env`.
2. Replace the placeholders with real values:

```env
# =============================================================================
# Supabase (Development)
# =============================================================================
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Never commit this file: it is in .gitignore
SUPABASE_SECRET_KEY=sb_secret_...

# =============================================================================
# App Configuration (Development)
# =============================================================================
NEXT_PUBLIC_APP_URL=http://localhost:3000

# =============================================================================
# Third-party Services (if any)
# =============================================================================
# STRIPE_SECRET_KEY=sk_test_...
# SENDGRID_API_KEY=SG...
```

3. Verify:

```bash
{{stack.package_manager}} run {{stack.scripts.dev}}
```

The app starts with no missing-variable errors, and the Supabase connection works.
````

## Step 3: staging (Vercel or Railway)

For Vercel, tell the user to add each variable with scope "Preview":

````markdown
## Configure variables in Vercel (staging)

Open https://vercel.com/[org]/[project]/settings/environment-variables and add each variable with scope "Preview":

| Variable Name                          | Value                                 | Environment |
| -------------------------------------- | ------------------------------------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | https://[staging-project].supabase.co | Preview     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sb_publishable_...                    | Preview     |
| `SUPABASE_SECRET_KEY`                  | sb_secret_...                         | Preview     |
| `NEXT_PUBLIC_APP_URL`                  | https://[project]-staging.vercel.app  | Preview     |

- Scope "Preview" is for staging only (the integration branch). Scope "Production" is configured in Stage 5.
- Vercel encrypts the values automatically.
- Click "Save" after each variable.
````

For Railway, the same variables go in the project's settings (https://railway.app/project/[project-id]/settings), under the "staging" environment, with "New Variable" for each of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_APP_URL`. Deploy again to apply them.

## Step 4: prepare the structure for production

Document what production will need, without configuring it. Create `.context/environment-variables.md`:

````markdown
# Environment Variables - [Project]

## Variables per environment

### Development (local)

File: `.env` (gitignored)

| Variable                               | Description                   | Example                 |
| -------------------------------------- | ----------------------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase dev project URL      | https://xxx.supabase.co |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key      | sb_publishable_...      |
| `SUPABASE_SECRET_KEY`                  | Secret key (server-only)      | sb_secret_...           |
| `NEXT_PUBLIC_APP_URL`                  | Base URL of the app           | http://localhost:3000   |

### Staging (Vercel Preview)

Platform: Vercel Dashboard, Settings, Environment Variables. Scope: Preview (only deploys of the integration branch).

| Variable                               | Value                                 | Notes                          |
| -------------------------------------- | ------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | https://[staging-project].supabase.co | Staging project in Supabase    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | [publishable key staging]             | Different from production      |
| `SUPABASE_SECRET_KEY`                  | [secret key staging]                  | Server-side only               |
| `NEXT_PUBLIC_APP_URL`                  | https://[project]-staging.vercel.app  | URL generated by Vercel        |

### Production (configure in Stage 5)

Platform: Vercel Dashboard, Settings, Environment Variables. Scope: Production (only deploys of the production branch).

| Variable                               | Value                              | Notes                    |
| -------------------------------------- | ---------------------------------- | ------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | https://[prod-project].supabase.co | Configure in Stage 5     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | [publishable key production]       | Configure in Stage 5     |
| `SUPABASE_SECRET_KEY`                  | [secret key production]            | Configure in Stage 5     |
| `NEXT_PUBLIC_APP_URL`                  | https://[domain].com               | Configure in Stage 5     |

## Adding a new variable

1. Add it to `.env.example` with an example value.
2. Add it to `.env` with the real development value.
3. Add it in Vercel (Settings, Environment Variables) with scope "Preview".
4. Add a row to the table above saying what it is for.

## Security

- `NEXT_PUBLIC_` variables are exposed in the browser: URLs and publishable keys only, never secret keys or API secrets.
- Private variables are readable only server-side (API routes, server components) and never in a client component.
- `.gitignore` must contain `.env`, `.env*.local` and `.env.production.local`.
- Rotate secret keys every 90 days, and regenerate immediately after any suspected compromise.
````

## Step 5: validate

Local: start the dev server (`{{stack.package_manager}} run {{stack.scripts.dev}}`) and check that there are no missing-variable errors, the Supabase connection works and the auth flow works.

Staging: trigger a deploy and check it.

```bash
# <integration> = git_strategy.branches.integration (.agents/project.yaml); null under
#   solo-main / github-flow / trunk-based: there, trigger the Preview deploy from a work branch instead
# Direct push to a protected branch: resolved by git_strategy.policy.direct_push_to_protected (/git-flow-master)
git checkout <integration>
git commit --allow-empty -m "test: trigger staging deploy to validate env vars"
git push origin <integration>
```

In the Vercel dashboard the build and the deployment succeed. Then open the staging URL and confirm:

- It opens, and the browser console shows no environment-variable errors.
- Signup and login work, and database queries work.

## Final report

```markdown
# Environment configuration completed

## Environments

- Development (local): `.env` filled with development values and validated locally.
- Staging (Vercel Preview): variables configured with scope "Preview", deploy validated at https://[project]-staging.vercel.app.
- Production (Stage 5): structure documented, placeholders in `.context/environment-variables.md`.

## Documentation

- `.context/environment-variables.md`: guide to every variable

## Next

1. Run `staging-deploy.md` for the first deploy.
2. QA's exploratory pass on staging (QA's workflow, outside this skill).
```

## With nobody at the keyboard

Follow `agentic-dev-core/references/decision-protocol.md` §5.2. Secret values are a human's to type in every mode, so the run never waits on them:

- Do the reversible work: update `.env.example`, write `.context/environment-variables.md`, and list which variables the human still has to set in `.env` and on the platform.
- Setting dashboard variables and the staging validation push (the empty commit) are outward. Do them only when a person asked or the delegating brief names them. A supervised worker asks its launcher. A routine reports them as pending.

## Done when

- Every variable from `.env.example` is classified as public or private.
- `.env.example` is complete, `.env` is the human's and gitignored, and the staging variables use scope "Preview" (or the host's staging equivalent).
- The staging deploy succeeded and the staging URL passes the checks in Step 5, or the report says which step is pending and why.
- `.context/environment-variables.md` has the full table and the security notes.

## References

- Vercel: https://vercel.com/docs/projects/environment-variables
- Next.js: https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
- Config best practices: https://12factor.net/config
