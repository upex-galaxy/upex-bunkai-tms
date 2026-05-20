import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@lib/env';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Server Components are read-only for cookies; the middleware
          // refreshes the session and writes the rotated cookies back.
          // Route Handlers and Server Actions reach this branch and write
          // successfully, which is why the try/catch is intentional.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          }
          catch {
            // no-op: called from a Server Component context.
          }
        },
      },
    },
  );
}
