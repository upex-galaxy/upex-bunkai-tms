# CI/CD setup (Stage 4, once per project)

Sets up a GitHub Actions workflow that lints, tests, builds and deploys to staging, so a merge to the integration branch reaches staging without a manual step. Run it once, after Stage 3 (code review) and before the first staging deploy (`staging-deploy.md`).

## Step 0: check whether the app already has CI

CI that exists is the app's, so this guide only adds to it. List `.github/workflows/` and read `{{stack.ci}}` in `.agents/project.yaml`:

| What you find | What you do |
|---|---|
| No workflow, and `{{stack.ci}}` is `github-actions` (or null) | Follow this guide, Steps 1 to 5. |
| One or more workflows (any name, `ci.yml` included) | Never replace, rename, delete or write over an existing workflow. Read which jobs run and on which branches. If Stage 4 needs something that is missing (lint, types, test, build or the integration deploy), propose a new workflow with its own name (for example `.github/workflows/agentic-checks.yml`) that adds only what is missing, or the small change to the existing one as a diff. Write nothing until the user approves. |
| `{{stack.ci}}` is `gitlab`, `other` or `none` | Out of scope. Report which CI the app uses (or that it has none) and that Stage 4 is verified against what that CI and `{{stack.hosting}}` expose. Do not create a GitHub Actions workflow in an app that uses another CI. |

## What to read first

> **Integration branch**: its real name is `git_strategy.branches.integration` in `.agents/project.yaml`. This guide writes it `<integration>`, and the production branch (`git_strategy.branches.production`) `<production>`, in git commands and in the workflow YAML. Substitute the real values when you generate the workflow. With integration null there is no such branch and no staging deploy job. Read the value before running any git command below.

1. The repository: `.git/` exists, a GitHub remote exists (`git remote -v`), `<production>` and `<integration>` (when not null) exist, and whether the repo is public or private. `<integration>` is `staging` by convention and may be null under `solo-main`, `github-flow` and `trunk-based`.
2. The project configuration:
   - `.agents/project.yaml`, `stack:` (critical): `app_root`, `package_manager`, the script names (`scripts.lint`, `scripts.types`, `scripts.test`, `scripts.build`), `ci`, `hosting`. A null script role means the app has no such script, so that job is not added.
   - The app's `package.json` (in `{{stack.app_root}}`), to confirm those scripts exist.
   - `.agents/project.yaml`, `environments` (URLs per environment) and `.vercel/project.json` (the linked Vercel project).
   - `.context/SRS/architecture-specs.md` for the tech stack. Without an SRS, use `{{stack.hosting}}` plus the `architecture` section of the API map (`bun run context:map business-api-context --section architecture`).
   - The ESLint configuration (`.eslintrc.js` or `eslint.config.js`), and whether a test framework (Jest or Vitest) and coverage are set up.
3. The hosting provider (Vercel, Railway, Netlify or custom) and its staging and production URLs. For Vercel the workflow also needs a Vercel project ID, org ID and API token, which only the user can provide.

Tools: git, access to the GitHub repo, and optionally the GitHub CLI to check secrets. Context7 is recommended for current Actions syntax before you write the workflow ("GitHub Actions latest setup Node.js", "Vercel deployment GitHub Actions latest", "GitHub Actions secrets configuration"). No other MCP is needed.

## What the workflow does

- Runs on push and pull request to `<production>` and `<integration>`.
- Lint, unit tests with optional coverage, and build, in that order, so a lint failure stops the rest.
- Deploys to Vercel staging on a push to `<integration>`.
- Optionally deploys to production on a push to `<production>` in a separate workflow (`.github/workflows/deploy-production.yml`), only behind a manual approval.

Out of scope: an automatic production deploy without approval, integration and E2E tests (QA's), performance tests, and security scanning (it can be added later).

Outputs: `.github/workflows/ci.yml`, the GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (plus any project-specific ones), `.context/ci-cd-setup.md`, and CI badges in `README.md`.

## Rules

- Secrets live in GitHub Secrets, never in the workflow. Use service tokens, not personal ones, and tell the user how to get each one. The user creates and adds the token values, and you never ask for them in the chat (Critical Rule 1).
- Check action versions with Context7 so no deprecated action ships. Check that every script exists in `package.json` before the workflow calls it.
- Create or edit files only (the workflow, the docs, the README badge). The one step that changes anything else is the commit and push of Step 4.
- Keep the workflow simple and modular, with one job per concern (lint, test, build, deploy) and `needs:` ordering so it fails fast.
- A production deploy always needs a manual approval.

## Step 1: analyze the project

1. Run `git status`, `git remote -v` and `git branch -a`. Is the project on GitHub, do `<production>` and `<integration>` exist, and which branch is active?
2. Read the app's `package.json` and list the scripts it has. For example:

   ```json
   {
     "scripts": {
       "lint:check": "eslint .", // ✅
       "test": "jest", // ✅
       "build": "next build" // ✅
     }
   }
   ```

   A missing script means that role's job is not added, and the report says so. Adding a script to the app's `package.json` is a separate change you propose to the user, never a side effect of this guide. If they approve it, register it with `bun run agents:setup --stack`.
3. Read `{{stack.hosting}}`, `.vercel/project.json` if present, and `.context/SRS/architecture-specs.md` when the project has an SRS. Identify the provider, the staging and production URLs, and the credentials needed.

Report the analysis to the user:

```markdown
## Analysis completed

### Git repository

- GitHub remote: https://github.com/[org]/[repo]
- Branches: <production>, <integration>

### App scripts available

- `{{stack.package_manager}} run {{stack.scripts.lint}}` (lint)
- `{{stack.package_manager}} run {{stack.scripts.test}}` (unit tests)
- `{{stack.package_manager}} run {{stack.scripts.build}}` (build)

### Hosting provider

- Provider: Vercel
- Staging URL: https://[project]-staging.vercel.app
- Production URL: https://[project].vercel.app

### Workflow to create

1. CI jobs: lint, test, build
2. Deploy to staging on a push to `<integration>` (null: Vercel deploys a Preview per PR and there is no job)
3. Optional: deploy to production on a push to `<production>`
```

## Step 2: create the workflow

Only when Step 0 found no CI. If a `ci.yml` already exists, the new workflow takes another name.

```bash
mkdir -p .github/workflows
```

Write `.github/workflows/ci.yml`. Substitute `<production>` and `<integration>` with `git_strategy.branches.*`. With integration null, remove that branch from the triggers and remove the `deploy-staging` job. A null script role removes its job. Run from `{{stack.app_root}}` with `working-directory` when it is not `.`.

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [<production>, <integration>]
  pull_request:
    branches: [<production>, <integration>]

jobs:
  lint:
    name: 🔍 Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v7

      - name: Setup runtime
        uses: oven-sh/setup-bun@v2 # stack.package_manager = bun (v1); other manager: actions/setup-node with its cache

      - name: Install dependencies
        run: {{stack.package_manager}} install --frozen-lockfile

      - name: Run linter
        run: {{stack.package_manager}} run {{stack.scripts.lint}}

  test:
    name: 🧪 Test
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Checkout code
        uses: actions/checkout@v7

      - name: Setup runtime
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: {{stack.package_manager}} install --frozen-lockfile

      - name: Run tests
        run: {{stack.package_manager}} run {{stack.scripts.test}}

      - name: Generate coverage
        run: {{stack.package_manager}} run test:coverage   # only if the app has that script
        continue-on-error: true

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./coverage/coverage-final.json

  build:
    name: 🏗️ Build
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Checkout code
        uses: actions/checkout@v7

      - name: Setup runtime
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: {{stack.package_manager}} install --frozen-lockfile

      - name: Build project
        run: {{stack.package_manager}} run {{stack.scripts.build}}

  deploy-staging:
    name: 🚀 Deploy to Staging
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/<integration>' && github.event_name == 'push'
    environment:
      name: staging
      url: https://${{ secrets.VERCEL_PROJECT_NAME }}-staging.vercel.app
    steps:
      - name: Checkout code
        uses: actions/checkout@v7

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./
```

The `needs:` chain makes a lint failure skip tests and build. Only the coverage step has `continue-on-error: true`, so a coverage failure never fails the workflow. The `environment:` block on the deploy job lets GitHub apply environment protection.

## Step 3: secrets in GitHub

Show the user how to obtain and add each secret. The user types the values into GitHub, you never see them.

```markdown
## Secrets configuration

The workflow needs these three secrets in GitHub.

### 1. VERCEL_TOKEN

1. Go to https://vercel.com/account/tokens
2. Click "Create Token"
3. Name: "GitHub Actions - [Project]"
4. Scope: Full Account
5. Expiration: No Expiration (or per your policy)
6. Copy the generated token

### 2. VERCEL_ORG_ID

1. Go to https://vercel.com/[your-org]/settings
2. Find "Team ID" or "Org ID" in Settings
3. Copy the ID (format: `team_xxxxx`)

### 3. VERCEL_PROJECT_ID

1. Open your project in Vercel: https://vercel.com/[org]/[project]
2. Click "Settings", then "General"
3. Find "Project ID" and copy it

### Add them to GitHub

1. Go to your repo: https://github.com/[org]/[repo]
2. Settings, then "Secrets and variables", then "Actions"
3. Click "New repository secret" and add each one:

   | Name                | Value                |
   | ------------------- | -------------------- |
   | `VERCEL_TOKEN`      | [token copied]       |
   | `VERCEL_ORG_ID`     | [org ID copied]      |
   | `VERCEL_PROJECT_ID` | [project ID copied]  |

4. Check that all three appear in the list
```

## Step 4: validate the workflow

Commit and push, then check the run.

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI/CD workflow"
# <integration> = git_strategy.branches.integration, <production> = git_strategy.branches.production (.agents/project.yaml)
# Direct push to a protected branch: resolved by git_strategy.policy.direct_push_to_protected (/git-flow-master)
git push origin <integration>
```

Then verify, and tell the user to verify, on https://github.com/[org]/[repo]/actions:

- The "CI/CD Pipeline" workflow runs. Lint, Test and Build pass (green), and Deploy Staging runs only on a push to `<integration>`.
- When a job fails, run its script locally (`{{stack.package_manager}} run {{stack.scripts.lint}}`, `{{stack.package_manager}} run {{stack.scripts.test}}` or `{{stack.package_manager}} run {{stack.scripts.build}}`), fix the errors and push again. For a failed deploy, check that the three secrets are set correctly and read the deploy logs in GitHub Actions.

## Step 5: document it

Create `.context/ci-cd-setup.md` for the team:

````markdown
# CI/CD Setup - [Project]

## GitHub Actions workflow

File: `.github/workflows/ci.yml`

### Triggers

The workflow runs on a push to `<production>`, a push to `<integration>`, and a pull request to either.

### Jobs

1. Lint: runs ESLint and validates code style (about 30 seconds).
2. Test: runs unit tests, generates a coverage report and optionally uploads it to Codecov (1 to 2 minutes).
3. Build: runs the production build and validates that the project compiles (1 to 2 minutes).
4. Deploy Staging: runs only on a push to `<integration>`, deploys to the Vercel staging environment at https://[project]-staging.vercel.app (about 30 seconds).

### Secrets

| Secret              | Description               | Where to get it                   |
| ------------------- | ------------------------- | --------------------------------- |
| `VERCEL_TOKEN`      | Vercel API token          | https://vercel.com/account/tokens |
| `VERCEL_ORG_ID`     | Vercel organization ID    | Vercel settings                   |
| `VERCEL_PROJECT_ID` | Vercel project ID         | Project settings                  |

### Branch strategy

```
<production> (git_strategy.branches.production)
  ^ merge after QA
<integration> (git_strategy.branches.integration; null = PRs go straight to <production>)
  ^ merge PRs here
feature/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}
```

### From local to production

1. Develop on a feature branch and push it.
2. Open a pull request to the integration branch. CI runs lint, test and build. When green, merge, and staging deploys automatically.
3. QA validates on https://[project]-staging.vercel.app. Bugs go back through a fix and repeat.
4. Release to production:

   ```bash
   # <production> / <integration>: git_strategy.branches.* in .agents/project.yaml
   # Promotion method: git_strategy.decisions.promote_method, via /git-flow-master
   git checkout <production>
   git merge <integration>
   git push origin <production>
   ```

   CI runs again, and production deploys automatically if you enabled that.

### Troubleshooting

- "Install dependencies" fails: check that the lockfile is committed, and reproduce with `{{stack.package_manager}} install --frozen-lockfile` locally.
- Deploy fails with "Invalid token": check that `VERCEL_TOKEN` is set in GitHub Secrets, and regenerate it in Vercel if needed.
- Coverage upload fails: it is optional and does not block the workflow. Configure Codecov to see coverage online.
````

Then add the badges at the top of `README.md`:

```markdown
# [Project]

[![CI/CD Pipeline](https://github.com/[org]/[repo]/actions/workflows/ci.yml/badge.svg)](https://github.com/[org]/[repo]/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/[org]/[repo]/branch/<integration>/graph/badge.svg)](https://codecov.io/gh/[org]/[repo])
```

## Final report

Tell the user what was created and what comes next:

- Created: `.github/workflows/ci.yml` (lint, test, build and deploy staging jobs), `.context/ci-cd-setup.md` (workflow, troubleshooting, branch strategy) and the README badges.
- Next, now: add the three secrets (Step 3), then push to trigger the workflow:

  ```bash
  git add .github/workflows/ci.yml .context/ci-cd-setup.md README.md   # explicit paths, never `git add .`
  git commit -m "ci: add GitHub Actions CI/CD workflow

  - Lint, test, build jobs
  - Auto-deploy to staging on integration-branch push
  - Documentation in .context/ci-cd-setup.md
  "
  # <integration> = git_strategy.branches.integration, <production> = git_strategy.branches.production (.agents/project.yaml)
  git push origin <integration>
  ```

- After that: check https://github.com/[org]/[repo]/actions, then the staging deploy in `staging-deploy.md`. Exploratory QA on staging is QA's workflow, outside this skill.

Every push to `<integration>` now deploys to staging.

## With nobody at the keyboard

Follow `agentic-dev-core/references/decision-protocol.md` §5.2. In this guide the points that wait for a person are:

- Step 0, an existing workflow: the proposal needs the user's OK. A supervised worker sends the proposal to its launcher, which holds the gate. A routine writes the proposed workflow or diff to its scratch directory, records it in the report and stops. It never edits an existing workflow without a brief that covers it.
- Step 3, secrets: only a human can create and add them. Record which secrets are missing in the report and continue with the workflow file.
- Step 4, commit and push: an outward action. Do it when a person asked for it or the delegating brief names it. Otherwise leave the files uncommitted and report that the push is pending.

## Done when

- Step 0 left every existing workflow untouched.
- `stack:` was read, each script was confirmed in the app's `package.json`, and a null role has no job.
- `.github/workflows/ci.yml` has the lint, test, build and deploy-staging jobs with correct `needs:` and triggers, using the branches from `git_strategy.branches` (integration may be null).
- The user has instructions to obtain and add each secret, and to read each job's result.
- `.context/ci-cd-setup.md` exists with troubleshooting and the branch strategy, and the README has its badge.

## References

- GitHub Actions: https://docs.github.com/en/actions/quickstart and https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
- Vercel deployment: https://vercel.com/docs/deployments/overview and https://github.com/marketplace/actions/vercel-action
- Hardening: https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
