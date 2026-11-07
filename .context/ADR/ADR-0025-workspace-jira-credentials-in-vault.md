# ADR-0025 — Workspace Jira credentials live in Supabase Vault, one connection per workspace

- **Status:** Accepted
- **Date:** 2026-11-06
- **Deciders:** Product owner (decided on BK-1170)
- **Tags:** jira, credentials, security, multi-tenant, supabase-vault, cross-cutting-invariant
- **Supersedes:** — (narrows the BK-43 ruling 12177 D6, "no credential in the database"; see Decision)
- **Superseded by:** —

---

## Context

Bunkai talked to Jira with ONE deployment-wide credential read from environment variables. On staging that credential stopped working: every import since 2026-09-10 failed with `jira_unauthorized ... 403`. Fixing the token would only restore the single-tenant arrangement, which cannot serve several customers: each customer has its own Jira site and its own account.

BK-43 ruling 12177 D6 had said no credential is kept in the database (see the header of migration 0091, kept as history). That ruling assumed one operator-owned credential. With one Jira per workspace the credential belongs to the customer, so it has to be stored somewhere the application can read at request time.

## Decision

We will store one Jira connection per workspace: site URL, email and API token. The token goes into Supabase Vault; the table `workspace_jira_connections` keeps only the Vault secret id. Access to the secret goes through `service_role`-only RPCs (migration 0119). There is no fallback to environment variables.

- Only a workspace owner or admin can create, replace, test or delete the connection. Any member can learn whether a connection exists.
- The token is write-only: it is accepted on save and never returned.
- The site must match `https://*.atlassian.net`. Every Jira fetch uses `redirect: 'error'`, so a credential is never replayed to another host.
- This narrows D6: the database holds a Vault reference and the Vault holds the secret; plaintext credentials are still never stored in a table.

Invariants every change must keep:

- No route returns the token or the Vault secret id.
- No log line or error message includes credentials or a Jira response body.
- No client (browser, user session) can read the table or `vault.*`.
- Only `lib/jira/credentials.ts` calls the get-credentials RPC.

## Consequences

- **Positive:** staging works again per workspace as soon as an owner connects Jira; no new environment variable; the model is multi-tenant by construction.
- **Negative / trade-offs:**
  - Reverses D6 as originally worded.
  - New dependency on Vault: moving the project to another Supabase project needs the Vault key, not just a database dump.
  - One service account is shared by every member of the workspace, so Jira shows its actions under that account.
  - Any server code holding the admin client could call the get-credentials RPC. The only protection is the convention above; nothing in the database stops it.
  - Local, staging and production share one Supabase project (MVP), so they all see the same connections.
  - No key rotation story beyond re-saving the token.
- **Audit:** connecting, changing and disconnecting the Jira connection are recorded in the activity log (`jira_connection.connected`, `.changed`, `.disconnected`; migration 0120). The payload holds the site host only, never the token, the secret id or the email.
- **Neutral / follow-ups:** the `ATLASSIAN_*` variables remain for developer tooling only (acli, sync scripts) and are not read by the app.

## Alternatives considered

- **pgcrypto with an application-held key** — reintroduces an environment variable (the key) and moves the same secret-management problem there.
- **Keep the environment variables and replace the token** — restores staging but is not multi-tenant, and the next expiry repeats the incident.
- **Atlassian OAuth 3LO** — the right long-term answer (per-user consent, scoped, revocable), but too large for this change.

## References

- BK-1170 (this change), BK-371 (tracker settings / defect sync), BK-43 ruling 12177 D6
- ADR-0012-rpc-authorization-invariant
- `supabase/migrations/0119_workspace_jira_connections.sql`; `supabase/migrations/0091` header (D6 history)
- `lib/jira/credentials.ts`, `lib/jira/connection-access.ts`
