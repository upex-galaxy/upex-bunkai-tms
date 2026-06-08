/**
 * @fileoverview Canonical variable manifest — the SINGLE SOURCE OF TRUTH for
 * how every environment variable in this repo is routed (D1 of the installer
 * `--variables` design).
 *
 * Today, var routing is scattered across four disconnected lists that drift
 * from each other: `INSTALLER_DEFERRED_VARS` / `MCP_SERVER_SECRETS` in
 * `cli/install.ts`, and `DAY_ZERO_VARS` / `PROJECT_BOUND_VARS` in
 * `cli/doctor.ts`. None of them encodes a *destination* (local vs. the remote
 * backend) or a *scope*. This module replaces all four with one typed
 * `VAR_MANIFEST: VarSpec[]` consumed by `install.ts`, `doctor.ts`, and
 * `update-boilerplate.ts`.
 *
 * `.env.example` stays the human-facing doc that users copy from; it is kept in
 * lockstep with this manifest by `scripts/check-vars.ts`, which asserts that
 * manifest ⇄ `.env.example` agree (fails in CI / pre-commit). The two never
 * drift because the parity check is a hard gate.
 *
 * Remote backend for THIS repo (agentic-dev-boilerplate, DEV) is **Vercel env**
 * (`vercel env add`), scoped per `production` / `preview` / `development` — the
 * repo deploys to Vercel and has no `.github/workflows`. (The sibling QA repo
 * targets GitHub Actions secrets instead; its manifest differs.)
 *
 * NOTE: this is Phase 1 (foundation). The manifest + parity check land here with
 * NO behavior change to the installer. Wiring `install.ts` / `doctor.ts` /
 * `update-boilerplate.ts` to consume `VAR_MANIFEST` is a later phase.
 *
 * Validation mirrors the `validateComponentRegistry` pattern in
 * `cli/lib/updater-core.ts`: `validateVarManifest()` is pure / no-I/O and throws
 * on a malformed entry so a misconfigured manifest fails fast at startup.
 */

import { readFileSync } from 'node:fs';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** Where a variable is written. `local` = `.env`; `vercel` = Vercel env. */
export type VarDestination = 'local' | 'vercel';

/** Vercel environment scope a var is set into. */
export type VarScope = 'production' | 'preview' | 'development';

/**
 * `required` is either an unconditional boolean or a conditional gate:
 * `{ ifEnv: '<VAR_NAME>' }` means "required only when env var `<VAR_NAME>` is
 * set (non-empty)". DEV has no conditional-required vars today, but the shape is
 * shared with the QA manifest (which gates STAGING_* on `TEST_ENV=staging`).
 */
export type VarRequired = boolean | { ifEnv: string };

export interface VarSpec {
  /** UPPER_SNAKE_CASE env-var name, exactly as it appears in `.env.example`. */
  name: string
  /** One or more write destinations. Always includes `local`. */
  destinations: VarDestination[]
  /**
   * Vercel scopes the var is set into when `destinations` includes `vercel`.
   * Omitted (undefined) for local-only vars.
   */
  scopes?: VarScope[]
  /** Secret value → masked in reports, piped via stdin (never argv) on remote write. */
  secret: boolean
  /** Unconditionally required, or conditionally required via `{ ifEnv }`. */
  required: VarRequired
  /**
   * CRITICAL = project-independent TOOL credential, prompted interactively
   * during the NORMAL installer (`configureMcps` / `configureDayZeroCredentials`).
   * Identical in both boilerplates: ATLASSIAN_URL/EMAIL/API_TOKEN (Jira/acli),
   * RESEND_API_KEY (email testing), TAVILY_API_KEY (pre-configured Tavily MCP).
   * Everything else is non-critical: never asked at install, never warned about,
   * surfaced only in the closing "Next steps" with an `obtainHint`.
   */
  critical: boolean
  /**
   * Non-critical vars only: where / how to obtain the value, shown verbatim in
   * the installer's "Next steps — finish later" section. Critical vars are
   * prompted at install so they don't need a closing hint.
   */
  obtainHint?: string
  /**
   * Auto-provisioned by the Supabase↔Vercel integration and PULLED via
   * `vercel env pull` (only available inside `bun run setup --variables`, since
   * at install time the infra does not exist yet). These vars are NEVER asked
   * at install and NEVER listed individually in the closing next-steps.
   */
  pulledFromInfra?: true
  /** Human note (provenance / where to get the value / why it's tracked). */
  note: string
}

export interface DeprecatedVar {
  /** UPPER_SNAKE_CASE name of the retired var. */
  name: string
  /** Why it's deprecated + what replaced it (surfaced in migration hints). */
  reason: string
}

// ----------------------------------------------------------------------------
// Manifest content (DEV — §2 of the handoff)
// ----------------------------------------------------------------------------

const ALL_SCOPES: VarScope[] = ['production', 'preview', 'development'];

/**
 * The canonical variable routing table for agentic-dev-boilerplate.
 *
 * Sourced from §2 (DEV table) of the handoff and reconciled against the EXACT
 * var names in `.env.example`, `cli/doctor.ts` `PROJECT_BOUND_VARS`
 * (the 7 POSTGRES_* names + the Supabase set), and `N8N_API_URL` / `N8N_API_KEY`.
 */
export const VAR_MANIFEST: VarSpec[] = [
  // --- CRITICAL tool credentials (project-independent; prompted at install) ---
  // These five are IDENTICAL in both boilerplates and asked interactively during
  // the normal installer. `critical: true` drives `criticalVars()`, which
  // `install.ts` uses to decide what to prompt on a fresh clone. They are NOT
  // pushed to Vercel (they are local tool creds, not app-runtime config).
  {
    name: 'ATLASSIAN_URL',
    destinations: ['local'],
    secret: false,
    required: true,
    critical: true,
    note: 'Atlassian site URL (acli + scripts/sync-jira-*.ts). Critical tool credential — prompted at install.',
  },
  {
    name: 'ATLASSIAN_EMAIL',
    destinations: ['local'],
    secret: false,
    required: true,
    critical: true,
    note: 'Atlassian account email (acli + scripts/sync-jira-*.ts). Critical tool credential — prompted at install.',
  },
  {
    name: 'ATLASSIAN_API_TOKEN',
    destinations: ['local'],
    secret: true,
    required: true,
    critical: true,
    note: 'Atlassian API token (acli + scripts/sync-jira-*.ts). Critical tool credential — prompted at install.',
  },
  {
    name: 'RESEND_API_KEY',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: true,
    required: true,
    critical: true,
    note: 'Resend API key (transactional email + resend CLI auth). Critical tool credential — prompted at install; app runtime → also reaches Vercel.',
  },
  {
    name: 'TAVILY_API_KEY',
    destinations: ['local'],
    secret: true,
    required: true,
    critical: true,
    note: 'Tavily web-search MCP API key. Critical tool credential — prompted at install.',
  },
  // --- Supabase project backend (auto-provisioned; pulled from Vercel) ---
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: false,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Supabase project URL (browser-safe). App runtime. Vercel+Supabase integration generates only this var.',
  },
  {
    name: 'SUPABASE_PUBLISHABLE_KEY',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: false,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Supabase new-style publishable key (browser-safe, replaces anon key).',
  },
  {
    name: 'SUPABASE_SECRET_KEY',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: true,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Supabase new-style secret key (server only, replaces service_role).',
  },
  {
    name: 'SUPABASE_JWT_SECRET',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: true,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Secret used to sign / verify custom JWTs. Known to doctor but not the installer today.',
  },
  // --- Postgres direct connection (auto-provisioned; pulled from Vercel) ---
  {
    name: 'POSTGRES_HOST',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: false,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Direct Postgres host for the Supabase project (db.<project-ref>.supabase.co).',
  },
  {
    name: 'POSTGRES_USER',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: false,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Postgres user (default: postgres).',
  },
  {
    name: 'POSTGRES_PASSWORD',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: true,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Postgres password for the project.',
  },
  {
    name: 'POSTGRES_DATABASE',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: false,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Postgres database name (default: postgres).',
  },
  {
    name: 'POSTGRES_URL',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: true,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Pooled Postgres connection string (port 6543). Contains the password → secret.',
  },
  {
    name: 'POSTGRES_URL_NON_POOLING',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: true,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Direct Postgres connection string (port 5432). Contains the password → secret.',
  },
  {
    name: 'POSTGRES_PRISMA_URL',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: true,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`.',
    note: 'Pooled connection with pgbouncer=true (for Prisma ORM). Contains the password → secret.',
  },
  // --- App config (auto-provisioned for the deployed URL; pulled from Vercel) ---
  {
    name: 'NEXT_PUBLIC_APP_URL',
    destinations: ['local', 'vercel'],
    scopes: ALL_SCOPES,
    secret: false,
    required: true,
    critical: false,
    pulledFromInfra: true,
    obtainHint: 'Auto-provisioned by Supabase↔Vercel — pull with `vercel env pull` via `bun run setup --variables`. Defaults to http://localhost:3000 locally.',
    note: 'Base URL for auth redirects, OAuth callbacks, email links. Referenced in code; previously untracked by installer AND doctor.',
  },
  // --- n8n automation (non-critical, local only, set when you adopt n8n) ---
  {
    name: 'N8N_API_URL',
    destinations: ['local'],
    secret: false,
    required: false,
    critical: false,
    obtainHint: 'Your n8n instance → Settings → API (e.g. https://n8n.yourapp.com/api/v1). Only needed if you use the n8n MCP server.',
    note: 'n8n instance API URL for the n8n MCP server (project-bound). Local only.',
  },
  {
    name: 'N8N_API_KEY',
    destinations: ['local'],
    secret: true,
    required: false,
    critical: false,
    obtainHint: 'Your n8n instance → Settings → API. Only needed if you use the n8n MCP server.',
    note: 'n8n API key for the n8n MCP server. Local only.',
  },
];

/**
 * Legacy / renamed keys that may still linger in a stale `.env`. Nothing reads
 * them anymore; surfaced so the updater + doctor can emit a migration hint.
 * Sourced from `cli/doctor.ts` `LEGACY_JIRA_CRED_KEYS`.
 */
export const DEPRECATED_VARS: DeprecatedVar[] = [
  {
    name: 'JIRA_URL',
    reason: 'Replaced by ATLASSIAN_URL (DRY Atlassian credential family). Nothing reads JIRA_URL anymore.',
  },
  {
    name: 'JIRA_USERNAME',
    reason: 'Replaced by ATLASSIAN_EMAIL (DRY Atlassian credential family). Nothing reads JIRA_USERNAME anymore.',
  },
  {
    name: 'JIRA_API_TOKEN',
    reason: 'Replaced by ATLASSIAN_API_TOKEN (DRY Atlassian credential family). Nothing reads JIRA_API_TOKEN anymore.',
  },
  // NOTE: the legacy Supabase keys (SUPABASE_ANON_KEY,
  // NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are deliberately
  // NOT listed here. Unlike the JIRA_* rename above (dead — nothing reads them),
  // the legacy anon / service_role keys are a VENDOR coexistence pair: Supabase
  // still provisions them alongside the new sb_publishable / sb_secret keys, both
  // work simultaneously, and the legacy ones stay valid until the end of 2026.
  // The Supabase↔Vercel integration ships both, so a fresh, correct .env has both
  // — flagging them as "obsolete / replaced" alarmed users about a valid setup.
];

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

/**
 * Thrown by `validateVarManifest` when a manifest entry is malformed (mirrors
 * `ComponentOverlapError` in `cli/lib/updater-types.ts`). Callers catch this to
 * print a friendly error before exiting — a misconfigured manifest is a
 * maintainer bug that must fail fast at startup.
 */
export class VarManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VarManifestError';
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Manifest entries whose `destinations` include `dest`. */
export function varsFor(dest: VarDestination): VarSpec[] {
  return VAR_MANIFEST.filter(spec => spec.destinations.includes(dest));
}

/**
 * The CRITICAL tool credentials — project-independent vars prompted interactively
 * during the normal installer (ATLASSIAN_URL/EMAIL/API_TOKEN, RESEND_API_KEY,
 * TAVILY_API_KEY). Drives `install.ts`'s day-0 prompt set. Identical in both
 * boilerplates.
 */
export function criticalVars(): VarSpec[] {
  return VAR_MANIFEST.filter(spec => spec.critical);
}

/**
 * Non-critical vars surfaced in the installer's closing "Next steps — finish
 * later" section. EXCLUDES `pulledFromInfra` vars (auto-provisioned by the
 * Supabase↔Vercel infra and pulled via `bun run setup --variables` — they are
 * covered by a single distinct next-steps line, never listed individually).
 */
export function nextStepsVars(): VarSpec[] {
  return VAR_MANIFEST.filter(spec => !spec.critical && spec.pulledFromInfra !== true);
}

/**
 * Vercel scopes for a var (the `scopes` array on its spec), or `[]` if the var
 * is unknown or has no `vercel` destination / no scopes declared.
 */
export function scopesFor(name: string): VarScope[] {
  const spec = VAR_MANIFEST.find(s => s.name === name);
  return spec?.scopes ?? [];
}

/** Whether a var is a secret per the manifest. Unknown vars → `false`. */
export function isManifestSecret(name: string): boolean {
  return VAR_MANIFEST.find(s => s.name === name)?.secret ?? false;
}

/**
 * Resolve a spec's `required` against a concrete env snapshot.
 *
 * - `required: true`  → always required.
 * - `required: false` → never required.
 * - `required: { ifEnv: 'X' }` → required only when `env.X` is set (non-empty).
 */
export function requiredNow(spec: VarSpec, env: Record<string, string | undefined>): boolean {
  if (typeof spec.required === 'boolean') {
    return spec.required;
  }
  const gateValue = env[spec.required.ifEnv];
  return gateValue !== undefined && gateValue.trim().length > 0;
}

/**
 * Parse the declared KEY names from a `.env.example` file. Returns the ordered
 * list of keys (deduped, first occurrence wins). Both active (`KEY=`) and
 * commented (`# KEY=`) declarations are recognized — a commented var is still a
 * "documented" var for parity purposes. Pure comment lines that are not a
 * `KEY=` declaration are ignored.
 *
 * Used by `scripts/check-vars.ts` to assert manifest ⇄ `.env.example` parity.
 */
export function parseDotEnvExampleKeys(path: string): string[] {
  const content = readFileSync(path, 'utf8');
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of content.split('\n')) {
    let line = rawLine.trim();
    if (line.length === 0) { continue; }
    // Strip a single leading comment marker so commented declarations
    // (`# KEY=...`) are recognized; preserve the rest of the line.
    if (line.startsWith('#')) {
      line = line.replace(/^#+\s*/, '');
    }
    line = line.replace(/^export\s+/, '');
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (m === null) { continue; }
    const key = m[1];
    if (seen.has(key)) { continue; }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

const VALID_DESTINATIONS: ReadonlySet<VarDestination> = new Set(['local', 'vercel']);
const VALID_SCOPES: ReadonlySet<VarScope> = new Set(['production', 'preview', 'development']);
const NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Validate the manifest at config-time. Pure / no I/O — operates on `VAR_MANIFEST`
 * and `DEPRECATED_VARS` only. Throws `VarManifestError` on the first malformed
 * entry so a misconfigured manifest fails fast at startup (mirror of
 * `validateComponentRegistry`).
 *
 * Checks:
 *  - non-empty, UPPER_SNAKE_CASE, unique names
 *  - every var has at least one destination, all destinations valid
 *  - every destination is `local` (DEV writes locally for every tracked var)
 *  - `scopes` present + valid iff `vercel` is a destination
 *  - conditional `required` references a non-empty gate name
 *  - critical vars carry no `obtainHint` / `pulledFromInfra` (prompted at install);
 *    non-critical vars declare a non-empty `obtainHint`
 *  - no name appears in BOTH the active manifest and `DEPRECATED_VARS`
 */
export function validateVarManifest(): void {
  const seen = new Set<string>();
  for (const spec of VAR_MANIFEST) {
    if (!NAME_RE.test(spec.name)) {
      throw new VarManifestError(
        `Invalid var name '${spec.name}': must be UPPER_SNAKE_CASE.`,
      );
    }
    if (seen.has(spec.name)) {
      throw new VarManifestError(`Duplicate var '${spec.name}' in VAR_MANIFEST.`);
    }
    seen.add(spec.name);

    if (spec.destinations.length === 0) {
      throw new VarManifestError(`Var '${spec.name}' has no destinations.`);
    }
    for (const dest of spec.destinations) {
      if (!VALID_DESTINATIONS.has(dest)) {
        throw new VarManifestError(`Var '${spec.name}' has invalid destination '${dest}'.`);
      }
    }
    if (!spec.destinations.includes('local')) {
      throw new VarManifestError(
        `Var '${spec.name}' must include the 'local' destination (every tracked var is written to .env).`,
      );
    }

    const hasVercel = spec.destinations.includes('vercel');
    if (hasVercel) {
      if (spec.scopes === undefined || spec.scopes.length === 0) {
        throw new VarManifestError(
          `Var '${spec.name}' targets 'vercel' but declares no scopes.`,
        );
      }
      for (const scope of spec.scopes) {
        if (!VALID_SCOPES.has(scope)) {
          throw new VarManifestError(`Var '${spec.name}' has invalid scope '${scope}'.`);
        }
      }
    }
    else if (spec.scopes !== undefined) {
      throw new VarManifestError(
        `Var '${spec.name}' declares scopes but has no 'vercel' destination.`,
      );
    }

    if (typeof spec.required !== 'boolean') {
      if (!spec.required.ifEnv || spec.required.ifEnv.trim().length === 0) {
        throw new VarManifestError(
          `Var '${spec.name}' has a conditional 'required' with an empty 'ifEnv' gate.`,
        );
      }
    }

    // Critical vars are prompted at install → they carry no closing-summary
    // metadata. Non-critical vars are surfaced in "Next steps" and must declare
    // how to obtain the value (either an explicit hint OR the infra-pull flag).
    if (spec.critical) {
      if (spec.obtainHint !== undefined) {
        throw new VarManifestError(
          `Critical var '${spec.name}' must NOT set 'obtainHint' (it is prompted at install).`,
        );
      }
      if (spec.pulledFromInfra === true) {
        throw new VarManifestError(
          `Critical var '${spec.name}' cannot be 'pulledFromInfra' (it is a prompted tool credential).`,
        );
      }
    }
    else {
      const hasHint = spec.obtainHint !== undefined && spec.obtainHint.trim().length > 0;
      if (!hasHint) {
        throw new VarManifestError(
          `Non-critical var '${spec.name}' must declare a non-empty 'obtainHint' for the closing next-steps.`,
        );
      }
    }

    if (spec.note.trim().length === 0) {
      throw new VarManifestError(`Var '${spec.name}' has an empty note.`);
    }
  }

  const deprecatedSeen = new Set<string>();
  for (const dep of DEPRECATED_VARS) {
    if (!NAME_RE.test(dep.name)) {
      throw new VarManifestError(
        `Invalid deprecated var name '${dep.name}': must be UPPER_SNAKE_CASE.`,
      );
    }
    if (deprecatedSeen.has(dep.name)) {
      throw new VarManifestError(`Duplicate deprecated var '${dep.name}'.`);
    }
    deprecatedSeen.add(dep.name);
    if (seen.has(dep.name)) {
      throw new VarManifestError(
        `Var '${dep.name}' appears in both VAR_MANIFEST and DEPRECATED_VARS.`,
      );
    }
    if (dep.reason.trim().length === 0) {
      throw new VarManifestError(`Deprecated var '${dep.name}' has an empty reason.`);
    }
  }
}
