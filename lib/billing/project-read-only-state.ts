import { isProjectReadOnly } from '@lib/billing/read-only-projects';
import { createClient } from '@lib/supabase/server';
import { cache } from 'react';

export const readProjectReadOnly = cache(async (workspaceId: string, projectId: string): Promise<boolean> =>
  isProjectReadOnly(await createClient(), workspaceId, projectId));
