// Server-only env is referenced here (SUPABASE_SERVICE_ROLE_KEY); ensure only
// server code imports this module. Browser code imports `@lib/supabase/client`
// directly, which never touches the service-role key.

// Next.js inlines `NEXT_PUBLIC_*` env vars only when accessed via STATIC
// member access on `process.env`. Dynamic access (e.g. `process.env[name]`)
// would resolve to `undefined` at the browser build.

const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `[bunkai/config] Missing required env var: ${name}. `
      + 'Set it in .env (see .env.example) and restart the dev server.',
    );
  }
  return value;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: required('NEXT_PUBLIC_SUPABASE_URL', NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY),
} as const;
