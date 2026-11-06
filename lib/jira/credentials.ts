import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWorkspaceJiraCredentials } from '@lib/supabase/rpc';
import { JiraAuthError } from './client';
import { normalizeJiraSiteUrl } from './site-url';
import 'server-only';

// BK-1170 — the Jira connection of a WORKSPACE (migration 0119). The API token
// lives in Supabase Vault; the only reader is `bunkai_get_workspace_jira_credentials`
// (service_role), called from here with the admin client AFTER the caller has been
// authorised (the tracker-settings routes, or the import job a member enqueued).
// There is no environment fallback.

type Admin = SupabaseClient<Database>;

export interface JiraCredentials {
  url: string
  email: string
  token: string
}

// The workspace has no Jira connection. Extends JiraAuthError so existing
// "credentials are unusable" handling still applies; callers that care read `code`.
export class JiraNotConnectedError extends JiraAuthError {
  readonly code = 'jira_not_connected';

  constructor() {
    super('Jira is not connected for this workspace.');
  }
}

// Decrypts and returns the workspace's credentials, or null when there is no
// connection (or the stored host fails re-validation). Logs the workspace id only.
export async function loadWorkspaceJiraCredentials(admin: Admin, workspaceId: string): Promise<JiraCredentials | null> {
  const { data, error } = await getWorkspaceJiraCredentials(admin, workspaceId);
  if (error) {
    console.error('workspace Jira credentials could not be read', { workspaceId, code: error.code });
    // Not the same as "no connection": surface it so the caller fails loudly.
    throw new Error('Jira credentials could not be read.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const { site_url: siteUrl, email, token } = data as { site_url?: unknown, email?: unknown, token?: unknown };
  if (typeof siteUrl !== 'string' || typeof email !== 'string' || typeof token !== 'string' || !email || !token) {
    return null;
  }
  const url = normalizeJiraSiteUrl(siteUrl);
  if (url === null) {
    console.error('workspace Jira site URL failed re-validation', { workspaceId });
    return null;
  }
  return { url, email, token };
}

// Cheap presence check: never decrypts the token.
export async function hasWorkspaceJiraConnection(admin: Admin, workspaceId: string): Promise<boolean> {
  const { count, error } = await admin
    .from('workspace_jira_connections')
    .select('workspace_id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (error) {
    console.error('workspace Jira connection presence check failed', { workspaceId, code: error.code });
    return false;
  }
  return (count ?? 0) > 0;
}
