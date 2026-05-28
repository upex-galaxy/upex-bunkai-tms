/* qa-guide-snapshot: stack=next-supabase-scalar, generated=2026-05-27, epic=BK-29, paths=14, ops=19 */

import Link from 'next/link';

// Software Testability Guide for QA
//
// Public, server-rendered. Lists every surface a tester can hit (UI / API /
// DB) and points to the Jira Epic that holds the actual credentials. We
// intentionally do NOT inline credentials here — the page is public.
//
// Re-runs of /testability-guide consult the `qa-guide-snapshot` comment above
// to detect stack drift and propose surgical patches instead of rewriting.

export const metadata = {
  title: 'Software Testability Guide for QA · Bunkai',
};

export default function QAGuidePage() {
  return (
    <div className="mx-auto max-w-[960px] px-6 py-10">
      <header className="mb-8">
        <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          QA reference
        </div>
        <h1 className="m-0 text-3xl font-bold tracking-tight text-fg-0">
          Software Testability Guide
        </h1>
        <p className="mt-3 max-w-[640px] text-md leading-relaxed text-fg-2">
          What you can exercise against Bunkai right now — UI flows, REST API, and Supabase database.
          Pair this page with the Jira credentials Epic to get the demo users and connection details
          that are NOT printed here.
        </p>
      </header>

      <section className="mb-8 rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-2 text-lg font-semibold tracking-tight text-fg-0">Architecture</h2>
        <p className="m-0 text-sm leading-relaxed text-fg-3">
          Next.js 15 (App Router) + Supabase (Auth + Postgres + Realtime) + Vercel.
          Multi-tenant: every workspace-scoped row is gated by Postgres RLS.
          Auth is magic-link via Supabase OTP; Bearer-PAT auth (
          {' '}
          <code>bk_pat_*</code>
          {' '}
          ) is available for headless agents.
        </p>
      </section>

      <section className="mb-8 rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-2 text-lg font-semibold tracking-tight text-fg-0">UI testing</h2>
        <ul className="m-0 grid gap-2 pl-5 text-sm leading-relaxed text-fg-2">
          <li>
            Sign-up: paste an email at
            <Link href="/login" className="text-accent underline">/login</Link>
            ; magic-link arrives via Supabase Auth.
          </li>
          <li>
            Onboarding: first-time users land at
            <code>/onboarding</code>
            {' '}
            to create a workspace.
          </li>
          <li>
            Project home:
            <code>/projects</code>
            {' '}
            redirects to the first project; the empty-state renders when none exist.
          </li>
          <li>
            ATC viewer/editor:
            <code>
              /projects/
              {'{slug}'}
              /atcs/
              {'{atcId}'}
            </code>
            {' '}
            (Monaco editor + step / assertion grid).
          </li>
          <li>
            Members & invites:
            <code>
              /workspaces/
              {'{id}'}
              /members
            </code>
            {' '}
            (admin/owner only).
          </li>
          <li>
            Invite acceptance:
            <code>/invites/accept?token=...</code>
            .
          </li>
        </ul>
      </section>

      <section className="mb-8 rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-2 text-lg font-semibold tracking-tight text-fg-0">API testing</h2>
        <ul className="m-0 grid gap-2 pl-5 text-sm leading-relaxed text-fg-2">
          <li>
            OpenAPI spec:
            {' '}
            <Link href="/api/openapi" className="text-accent underline">/api/openapi</Link>
            {' '}
            (JSON; 12 paths / 17 operations as of generation).
          </li>
          <li>
            Interactive docs:
            {' '}
            <Link href="/api/docs" className="text-accent underline">/api/docs</Link>
            {' '}
            (Scalar UI; try requests directly from the page).
          </li>
          <li>
            Discovery:
            {' '}
            <Link href="/api/v1" className="text-accent underline">/api/v1</Link>
            {' '}
            returns the version banner.
          </li>
          <li>
            Liveness:
            {' '}
            <Link href="/api/v1/health" className="text-accent underline">/api/v1/health</Link>
            .
          </li>
          <li>
            Browser auth:
            {' '}
            <code>POST /api/v1/auth/magic-link</code>
            {' '}
            then click the email link.
          </li>
          <li>
            Headless auth (no browser):
            {' '}
            <code>POST /api/v1/auth/signup</code>
            {' '}
            then
            {' '}
            <code>POST /api/v1/auth/signin</code>
            {' '}
            with email + password — both return a Supabase session AND a freshly-minted Bearer PAT in the same response. Use the PAT in
            {' '}
            <code>Authorization: Bearer bk_pat_…</code>
            .
          </li>
          <li>
            Bearer PAT end-to-end:
            {' '}
            <code>GET /api/v1/me</code>
            {' '}
            accepts both cookie and Bearer auth. The response field
            {' '}
            <code>auth.source</code>
            {' '}
            tells you which path served the request — handy for CLI smoke tests.
          </li>
        </ul>
      </section>

      <section className="mb-8 rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-2 text-lg font-semibold tracking-tight text-fg-0">
          Headless API auth (CLI / agent / QA)
        </h2>
        <p className="m-0 text-sm leading-relaxed text-fg-3">
          Three-step flow to authenticate against the API without ever opening a browser.
          Designed for automation scripts, curl smoke tests, and CI pipelines.
        </p>

        <div className="mt-4 rounded-2 border border-stroke-2 bg-surface-2 p-3 text-xs leading-relaxed text-fg-2">
          <strong className="text-fg-0">Important:</strong>
          {' '}
          Users created via magic-link
          (
          <code>/login</code>
          {' '}
          UI) have
          {' '}
          <em>no password set</em>
          {' '}
          in
          {' '}
          <code>auth.users.encrypted_password</code>
          . They cannot authenticate via
          {' '}
          <code>/api/v1/auth/signin</code>
          . Provision a dedicated QA user via
          {' '}
          <code>/api/v1/auth/signup</code>
          {' '}
          (which sets a password explicitly) before running headless flows.
        </div>

        <ol className="m-0 mt-4 grid gap-4 pl-5 text-sm leading-relaxed text-fg-2">
          <li>
            <strong className="text-fg-0">Step 1 — Provision a QA user (one-time per environment)</strong>
            <pre className="mt-2 overflow-x-auto rounded-2 bg-surface-2 p-3 text-xs text-fg-1">
              {`curl -X POST https://<host>/api/v1/auth/signup \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "qa.bot@bunkai-test.dev",
    "password": "<strong-secret>",
    "pat_name": "qa-bot-primary",
    "pat_scopes": ["atc:read","atc:write","run:execute","workspace:admin"]
  }'

# 201 Created
# {
#   "user":    { "id": "<uuid>", "email": "qa.bot@bunkai-test.dev" },
#   "session": { "access_token": "...", "refresh_token": "...", "expires_at": <ts> },
#   "pat":     {
#     "token":   "bk_pat_<prefix>.<secret>",   <- shown once. SAVE IT.
#     "id":      "<uuid>",
#     "scopes":  ["atc:read","atc:write","run:execute","workspace:admin"],
#     "expires_at": null
#   },
#   "warning": "Store the PAT token now — it cannot be retrieved later."
# }

# 409 Conflict  -> user already exists; skip to Step 2.
# 422           -> validation (password too short, bad email, etc).`}
            </pre>
          </li>

          <li>
            <strong className="text-fg-0">Step 2 — Sign in to mint a fresh PAT</strong>
            {' '}
            (every CI run, every test session)
            <pre className="mt-2 overflow-x-auto rounded-2 bg-surface-2 p-3 text-xs text-fg-1">
              {`curl -X POST https://<host>/api/v1/auth/signin \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "qa.bot@bunkai-test.dev",
    "password": "<strong-secret>",
    "pat_name": "ci-run-${'$'}{BUILD_ID}",
    "pat_expires_in_days": 7
  }'

# 200 OK -> same shape as Step 1.
# 401    -> wrong credentials (or magic-link-only user without password).`}
            </pre>
          </li>

          <li>
            <strong className="text-fg-0">Step 3 — Call any protected endpoint with the Bearer PAT</strong>
            <pre className="mt-2 overflow-x-auto rounded-2 bg-surface-2 p-3 text-xs text-fg-1">
              {`curl https://<host>/api/v1/me \\
  -H 'Authorization: Bearer bk_pat_<prefix>.<secret>'

# 200 OK
# {
#   "user":               { "id": "...", "email": "..." },
#   "workspaces":         [ { "id": "...", "slug": "...", "name": "..." } ],
#   "active_workspace_id": "<uuid>",
#   "auth": { "source": "bearer", "scopes": [...] }   <- confirms the path
# }

curl https://<host>/api/v1/workspaces \\
  -H 'Authorization: Bearer bk_pat_<prefix>.<secret>'`}
            </pre>
          </li>
        </ol>

        <div className="mt-4">
          <strong className="block text-xs font-semibold uppercase tracking-widest text-fg-3">
            PAT scopes (granted at issuance time, immutable per token)
          </strong>
          <ul className="m-0 mt-2 grid gap-1 pl-5 text-sm leading-relaxed text-fg-2">
            <li>
              <code>atc:read</code>
              {' '}
              — read ATCs, steps, assertions, modules, user stories, AC.
            </li>
            <li>
              <code>atc:write</code>
              {' '}
              — create/update/delete ATCs.
            </li>
            <li>
              <code>run:execute</code>
              {' '}
              — start runs + post step results (lands in Sprint 2).
            </li>
            <li>
              <code>workspace:admin</code>
              {' '}
              — manage members, invites, workspace metadata.
            </li>
          </ul>
        </div>

        <div className="mt-4">
          <strong className="block text-xs font-semibold uppercase tracking-widest text-fg-3">
            Endpoints already accepting Bearer
          </strong>
          <ul className="m-0 mt-2 grid gap-1 pl-5 text-sm leading-relaxed text-fg-2">
            <li>
              <code>GET /api/v1/me</code>
              {' '}
              — identity + workspace list + active workspace.
            </li>
            <li>
              <code>GET /api/v1/workspaces</code>
              {' '}
              — workspaces the caller belongs to.
            </li>
            <li>
              All others currently require the cookie session. Bearer is rolled into
              additional read endpoints as the Sprint progresses.
            </li>
          </ul>
        </div>

        <div className="mt-6 border-t border-stroke-2 pt-4">
          <h3 className="m-0 mb-2 text-sm font-semibold uppercase tracking-widest text-fg-3">
            Hybrid path — extract a PAT from an existing browser session
          </h3>
          <p className="m-0 text-sm leading-relaxed text-fg-2">
            If a tester has already signed in via the magic-link UI, they can extract a
            Bearer PAT without re-authenticating. The cookie session is sufficient — useful
            when the QA flow starts in the browser and then hands off to a CLI script.
          </p>
          <ol className="m-0 mt-3 grid gap-2 pl-5 text-sm leading-relaxed text-fg-2">
            <li>
              Sign in normally at
              {' '}
              <Link href="/login" className="text-accent underline">/login</Link>
              .
            </li>
            <li>
              In the browser DevTools, copy the
              {' '}
              <code>sb-fmbpikzpkafptqximhxn-auth-token</code>
              {' '}
              cookie (Application → Cookies). Or use the same browser session via curl with
              {' '}
              <code>--cookie</code>
              .
            </li>
            <li>
              Mint a PAT bound to that session:
              <pre className="mt-2 overflow-x-auto rounded-2 bg-surface-2 p-3 text-xs text-fg-1">
                {`curl -X POST https://<host>/api/v1/tokens \\
  -H 'content-type: application/json' \\
  --cookie 'sb-fmbpikzpkafptqximhxn-auth-token=<value>' \\
  -d '{ "name": "browser-hybrid", "scopes": ["atc:read","atc:write"] }'

# 201 Created
# {
#   "id":       "<uuid>",
#   "token":    "bk_pat_<prefix>.<secret>",   <- shown once
#   "scopes":   ["atc:read","atc:write"],
#   "warning":  "Store this token now — it cannot be retrieved later."
# }`}
              </pre>
            </li>
            <li>
              List existing tokens (no secrets returned):
              {' '}
              <code>GET /api/v1/tokens</code>
              .
            </li>
            <li>
              Revoke / rename a token:
              {' '}
              <code>
                PATCH /api/v1/tokens/
                {'{id}'}
              </code>
              ,
              {' '}
              <code>
                DELETE /api/v1/tokens/
                {'{id}'}
              </code>
              .
            </li>
          </ol>
          <p className="mt-3 text-xs text-fg-4">
            This path is also the right pick for production users (who only have magic-link,
            no password) that need to drive Bunkai from an external automation. Magic-link
            user lifecycle stays unchanged.
          </p>
        </div>

        <div className="mt-4 rounded-2 border border-stroke-2 bg-surface-2 p-3 text-xs leading-relaxed text-fg-2">
          <strong className="text-fg-0">Token hygiene:</strong>
          {' '}
          The raw token is returned ONCE. The DB stores only
          {' '}
          <code>sha256(secret)</code>
          {' '}
          + the first 12 chars of the secret as
          {' '}
          <code>token_prefix</code>
          {' '}
          (for an O(1) index lookup). If you lose the token, revoke it via
          {' '}
          <code>
            DELETE /api/v1/tokens/
            {'{id}'}
          </code>
          {' '}
          and mint a new one — there is no recovery path.
        </div>
      </section>

      <section className="mb-8 rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-2 text-lg font-semibold tracking-tight text-fg-0">Database testing</h2>
        <p className="m-0 text-sm leading-relaxed text-fg-3">
          Supabase project:
          {' '}
          <code>fmbpikzpkafptqximhxn</code>
          {' '}
          (region us-east-1, Postgres 17.6). Two QA roles are provisioned with BYPASSRLS so
          testers can inspect or mutate state without going through the API:
        </p>
        <ul className="m-0 mt-3 grid gap-1 pl-5 text-sm leading-relaxed text-fg-2">
          <li>
            <code>qa_inspector_ro</code>
            {' '}
            — read-only (SELECT on
            {' '}
            <code>public.*</code>
            ).
          </li>
          <li>
            <code>qa_inspector_rw</code>
            {' '}
            — read + write (SELECT, INSERT, UPDATE, DELETE on
            {' '}
            <code>public.*</code>
            ).
          </li>
          <li>
            Both roles have column-level REVOKE on
            {' '}
            <code>access_tokens.hash</code>
            ,
            {' '}
            <code>workspace_invites.token_hash</code>
            , and
            {' '}
            <code>magic_link_tokens.token_hash</code>
            {' '}
            — secret material remains opaque even with BYPASSRLS.
          </li>
        </ul>
        <p className="m-0 mt-3 text-sm leading-relaxed text-fg-3">
          Passwords for both roles live in the credentials Epic (BK-29). Connection details
          (host / port / db name) are environment-specific; see
          {' '}
          <code>.env.example</code>
          {' '}
          for the variable names.
        </p>
        <ul className="m-0 mt-3 grid gap-1 pl-5 text-sm leading-relaxed text-fg-2">
          <li>
            RLS is enabled on every table;
            <code>auth.uid()</code>
            {' '}
            drives membership checks via the
            <code>bunkai_is_workspace_member</code>
            {' '}
            family.
          </li>
          <li>
            Cross-tenant probe: log in as user B, attempt to select from
            <code>projects</code>
            {' '}
            with a workspace_id of user A — expect 0 rows.
          </li>
          <li>Idempotency keys, activity log, feature flags, view state, and magic-link audit trail land in the cross-cutting tables created by migration 0009.</li>
        </ul>
      </section>

      <section className="mb-8 rounded-3 border border-stroke-2 bg-surface-1 p-5">
        <h2 className="m-0 mb-2 text-lg font-semibold tracking-tight text-fg-0">Demo users & credentials</h2>
        <p className="m-0 text-sm leading-relaxed text-fg-3">
          Demo accounts, DB connection strings, and any other sensitive values live in the Jira
          credentials Epic for this project (
          <strong>BK-29</strong>
          {' '}
          —
          {' '}
          <em>Bunkai TMS — Credenciales de Acceso para Testing</em>
          ). Reach out to your QA lead for access if you
          do not already have it.
        </p>
        <p className="mt-3 text-xs text-fg-4">
          Why we do not print them here: this page is public; printing real credentials would expose them to anyone with the URL.
        </p>
      </section>

      <footer className="mt-12 border-t border-stroke-2 pt-4 text-xs text-fg-4">
        Generated by
        {' '}
        <code>/testability-guide</code>
        {' '}
        · stack: next-supabase-scalar · last update: 2026-05-27
      </footer>
    </div>
  );
}
