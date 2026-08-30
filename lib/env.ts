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

  // Stripe — server-only (BK-230). Optional, same posture as the Atlassian
  // vars above: a missing key is not a boot-time crash, it is a
  // `payment_processor_unavailable` 503 the first time a workspace tries to
  // reach checkout — see lib/billing/stripe.ts.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CLOUD_PRICE_ID: z.string().optional(),

  // Resend — server-only. Used by the BK-214 notification digest sender.
  // Optional: missing/invalid credentials surface as a failed digest send
  // (logged per-user, never an app-boot error) — mirrors the Atlassian vars.
  RESEND_API_KEY: z.string().optional(),
  // Sender address for digest emails. No custom domain is verified in Resend
  // for this project yet, so this defaults to Resend's own sandbox sender
  // (works with zero domain setup) and stays swappable via env once a
  // verified `bunkai.example`-style domain exists.
  RESEND_DIGEST_FROM_EMAIL: z.string().default('Bunkai <onboarding@resend.dev>'),

  // Bearer secret Vercel Cron sends on `POST /api/v1/admin/send-digest`
  // (`vercel.json`'s `crons` entry) — the system/cron principal class
  // (ADR-0017). Required, unlike `RESEND_API_KEY`: an unauthenticated
  // version of this route is a cross-user data-exfiltration path, not a
  // degraded feature, so a deployment missing it should fail at boot rather
  // than silently accept unauthenticated triggers.
  CRON_SECRET: z.string().min(1),
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
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_CLOUD_PRICE_ID: process.env.STRIPE_CLOUD_PRICE_ID,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_DIGEST_FROM_EMAIL: process.env.RESEND_DIGEST_FROM_EMAIL,
  CRON_SECRET: process.env.CRON_SECRET,
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
