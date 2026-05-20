import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@lib/config';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import 'server-only';

export function createAdminClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
