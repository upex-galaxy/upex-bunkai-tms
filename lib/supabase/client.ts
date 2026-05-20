import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// `NEXT_PUBLIC_*` accessed statically so Next.js inlines them into the
// client bundle. Never import `@lib/env` here — that module references
// the service-role key and is `server-only`.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Per-tab singleton so React strict-mode double-mounts do not produce
// multiple GoTrueClient instances.
let cached: SupabaseClient<Database> | null = null;

export function createClient(): SupabaseClient<Database> {
  if (cached) {
    return cached;
  }
  cached = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
