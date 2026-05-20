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
});

const parsed = EnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
