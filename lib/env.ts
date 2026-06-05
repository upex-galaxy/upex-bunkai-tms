// Single source of truth for runtime environment variables.
//
// IMPORTANT: this module is server-only. It validates `SUPABASE_SERVICE_ROLE_KEY`,
// which must never reach the browser bundle. Client-side code reads
// `NEXT_PUBLIC_*` variables directly via `process.env` (statically) so Next.js
// can inline them at build time — see `lib/supabase/client.ts` and `middleware.ts`.
//
// Why static `process.env.X` access: Next.js inlines `NEXT_PUBLIC_*` env vars
// only when accessed via STATIC member access. Dynamic access (e.g.
// `process.env[name]`) resolves to `undefined` in the browser build.

import { z } from 'zod';
import 'server-only';

const EnvSchema = z.object({
  // Supabase — public (safe to expose in client bundles, but validated here for
  // server-side modules that import `env` directly).
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  // Supabase — service role. Server-only. Bypasses RLS. Never expose.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Supabase JWT secret. Optional in MVP — populated when the Bearer-PAT
  // middleware needs to verify a Supabase-issued JWT instead of just the PAT
  // hash. Required before any feature that signs custom claims.
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),

  // Public app URL used for auth redirects, invite links, and OAuth callbacks.
  // Defaults to localhost in dev; must be set in every deployed env.
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Atlassian / Jira REST — server-only. Used by the Jira import worker (BK-17).
  // Optional: missing or invalid credentials surface as a failed import job
  // (errors[].code = jira_unauthorized), not an app-boot error.
  ATLASSIAN_URL: z.string().url().optional(),
  ATLASSIAN_EMAIL: z.string().optional(),
  ATLASSIAN_API_TOKEN: z.string().optional(),
});

const parsed = EnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  ATLASSIAN_URL: process.env.ATLASSIAN_URL,
  ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
  ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `[bunkai/env] Invalid environment variables:\n${issues}\n`
    + 'Set them in .env (see .env.example) and restart the dev server.',
  );
}

export const env = parsed.data;
