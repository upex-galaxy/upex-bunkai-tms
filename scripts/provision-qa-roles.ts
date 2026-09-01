#!/usr/bin/env bun
/**
 * Finishes provisioning the QA database-inspection roles on a fresh environment.
 *
 * WHY THIS EXISTS
 *   Migration 0085 creates `qa_inspector_ro` / `qa_inspector_rw` when they are
 *   absent, but creates them NOLOGIN and without a password — a credential must
 *   never be committed to git, and a migration file lives in the history
 *   forever. That leaves a rebuilt environment with two roles that hold every
 *   grant they need and cannot be connected to.
 *
 *   This script closes that gap. It reads the passwords from `.env` (where they
 *   already live, alongside the connection strings the /qa page documents) and
 *   issues the ALTER ROLE that turns the roles into usable logins. One command,
 *   no secret in the repository, and the resulting connection strings match
 *   QA_INSPECTOR_RO_URL / QA_INSPECTOR_RW_URL exactly.
 *
 * ON THE EXISTING DATABASE this is idempotent and a no-op in practice: it
 * re-applies the password that `.env` already holds, so the credential handed
 * out in the Jira credentials ticket keeps working unchanged.
 *
 * SAFETY
 *   - The password is never printed, never logged, and never interpolated into
 *     a SQL string by this script. Postgres does the quoting itself via
 *     `format('%I', ...)` / `format('%L', ...)`, so neither the role name nor
 *     the password can break out of its literal.
 *   - Connects through POSTGRES_URL_NON_POOLING (direct, not the pooler). Role
 *     management is a cluster-level operation and does not belong on a pooled
 *     connection.
 *   - Refuses to invent anything: a missing env var stops the run and names the
 *     variable, per the project's credential rule.
 *
 * Usage:  bun run db:qa-roles
 */

import { SQL } from 'bun';

interface QaRole {
  /** Canonical Postgres role name. */
  name: string
  /** `.env` slot holding this role's password. */
  passwordVar: string
}

const ROLES: QaRole[] = [
  { name: 'qa_inspector_ro', passwordVar: 'QA_INSPECTOR_RO_PASSWORD' },
  { name: 'qa_inspector_rw', passwordVar: 'QA_INSPECTOR_RW_PASSWORD' },
];

const ADMIN_URL_VAR = 'POSTGRES_URL_NON_POOLING';

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// Collect every missing variable before failing so the operator fixes the .env
// once instead of discovering the gaps one run at a time.
function readEnvOrFail(): { adminUrl: string, passwords: Map<string, string> } {
  const missing: string[] = [];

  const adminUrl = process.env[ADMIN_URL_VAR];
  if (!adminUrl) {
    missing.push(ADMIN_URL_VAR);
  }

  const passwords = new Map<string, string>();
  for (const role of ROLES) {
    const value = process.env[role.passwordVar];
    if (value) {
      passwords.set(role.name, value);
    }
    else {
      missing.push(role.passwordVar);
    }
  }

  if (missing.length > 0) {
    fail(
      `Missing in .env: ${missing.join(', ')}\n`
      + '  Add them (see .env.example), then re-run. Values are never guessed.',
    );
  }

  return { adminUrl: adminUrl as string, passwords };
}

async function main(): Promise<void> {
  const { adminUrl, passwords } = readEnvOrFail();
  const pg = new SQL(adminUrl);

  try {
    console.log('\nProvisioning QA inspection roles\n');

    for (const role of ROLES) {
      const exists = await pg`
        select 1 from pg_roles where rolname = ${role.name}
      `;

      if (exists.length === 0) {
        fail(
          `Role ${role.name} does not exist.\n`
          + '  Apply migration 0085_qa_inspector_role_bootstrap_and_function_grants first — '
          + 'it creates the role and its grants; this script only sets the login credential.',
        );
      }

      // Postgres builds the statement so the role name is quoted as an
      // identifier (%I) and the password as a literal (%L). The secret never
      // passes through string concatenation on our side.
      const [built] = await pg`
        select format('alter role %I login password %L', ${role.name}::text, ${passwords.get(role.name)}::text) as stmt
      `;

      await pg.unsafe(built.stmt);
      console.log(`  ${role.name.padEnd(18)} LOGIN set from ${role.passwordVar}`);
    }

    // Report the state the operator actually cares about: can these roles log
    // in, and did they keep the access the migration granted them?
    //
    // Queried one role at a time on purpose. Binding a JS array into `= any(...)`
    // makes Bun's Postgres driver send it as the plain string
    // "qa_inspector_ro,qa_inspector_rw", which Postgres rejects with
    // `malformed array literal`. Two round trips is a fine price for a script
    // that runs once per environment.
    console.log('\nVerification\n');

    for (const role of ROLES) {
      const [row] = await pg`
        select
          r.rolcanlogin,
          r.rolbypassrls,
          (select count(*)
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and not p.prosecdef
              and not has_function_privilege(r.rolname, p.oid, 'EXECUTE')) as invoker_rpcs_denied
        from pg_roles r
        where r.rolname = ${role.name}
      `;

      const denied = Number(row.invoker_rpcs_denied);
      console.log(
        `  ${role.name.padEnd(18)} login=${(row.rolcanlogin ? 'yes' : 'NO').padEnd(4)} `
        + `bypassrls=${row.rolbypassrls ? 'yes' : 'no'}  invoker RPCs denied: ${denied}`,
      );
      if (denied > 0) {
        console.warn(
          `    ⚠ ${denied} SECURITY INVOKER function(s) still denied — `
          + 'migration 0085 may not be applied on this database.',
        );
      }
    }

    console.log(
      '\n✓ Done. Connect with the strings in QA_INSPECTOR_RO_URL / QA_INSPECTOR_RW_URL.\n',
    );
  }
  finally {
    await pg.close();
  }
}

await main();
