import type { Principal } from '@lib/api/principal';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { assertWorkspaceContext } from '@lib/api/principal';
import { z } from 'zod';

// BK-1170 — gates, public shape and RPC error mapping shared by the workspace
// Jira-connection routes. Reads of the role go through the CALLER's client
// (`principal.db`), so row-level security decides what the caller may see. The
// connection table itself has no client policy: it is read with the admin client,
// and never selects `token_secret_id`.

type Db = Principal['db'];
type Admin = SupabaseClient<Database>;

export const JIRA_CONNECTION_MESSAGES = {
  admin_required: 'Only a workspace owner or admin can manage the Jira connection.',
  invalid_site_url: 'Use your Jira Cloud site address, for example https://your-company.atlassian.net.',
  invalid_email: 'Enter the email address of the Atlassian account that owns the API token.',
  token_required: 'Enter the Jira API token.',
  workspace_not_found: 'Workspace not found.',
} as const;

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// `.../workspaces/{id}/jira-connection[/check]` -> the id segment after `workspaces`.
export function extractWorkspaceId(request: Request): string {
  const segments = new URL(request.url).pathname.split('/');
  const index = segments.lastIndexOf('workspaces');
  return index >= 0 ? (segments[index + 1] ?? '') : '';
}

export function assertWorkspaceIdIsUuid(workspaceId: string): void {
  if (!UUID_PATTERN.test(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
}

// The caller's ACTIVE role in the workspace, read live. A workspace the caller
// cannot see (not a member, soft-deleted, no such id) is the SAME 404.
export async function readActiveRole(db: Db, principal: Principal, workspaceId: string): Promise<string> {
  assertWorkspaceContext(principal, workspaceId);
  const { data, error } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', principal.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'The workspace role could not be read.');
  }
  if (!data) {
    throw new ApiError('not_found', JIRA_CONNECTION_MESSAGES.workspace_not_found, { details: { reason: 'not_found' } });
  }
  return data.role;
}

export function isAdminRole(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

// Admin gate for the write, the delete and the check. Runs before the body is
// parsed, before the admin client is built and before any Jira call.
export async function assertCanAdministerJiraConnection(args: { db: Db, principal: Principal, workspaceId: string }): Promise<void> {
  const role = await readActiveRole(args.db, args.principal, args.workspaceId);
  if (!isAdminRole(role)) {
    throw new ApiError('forbidden', JIRA_CONNECTION_MESSAGES.admin_required, {
      details: { reason: 'admin_required' },
    });
  }
}

export interface JiraConnectionMeta {
  site_url: string
  email: string
  updated_at: string
  updated_by: string | null
}

// Metadata only. `token_secret_id` is never selected.
export async function readConnectionMeta(admin: Admin, workspaceId: string): Promise<JiraConnectionMeta | null> {
  const { data, error } = await admin
    .from('workspace_jira_connections')
    .select('site_url, email, updated_at, updated_by')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'The Jira connection could not be loaded.');
  }
  return data;
}

// Maps a bunkai_upsert / bunkai_delete_workspace_jira_connection error (SQLSTATE,
// migration 0119) to the API envelope. Always throws. Constant messages only: the
// RPC error text never reaches the client.
export function mapJiraConnectionRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case 'P0002':
      throw new ApiError('not_found', JIRA_CONNECTION_MESSAGES.workspace_not_found, {
        details: { reason: 'not_found' },
      });
    case '42501':
      if (error.message !== 'forbidden') {
        break;
      }
      throw new ApiError('forbidden', JIRA_CONNECTION_MESSAGES.admin_required, {
        details: { reason: 'admin_required' },
      });
    case '45420':
      throw new ApiError('validation_failed', JIRA_CONNECTION_MESSAGES.invalid_site_url, {
        details: { reason: 'invalid_site_url' },
      });
    case '45421':
      throw new ApiError('validation_failed', JIRA_CONNECTION_MESSAGES.invalid_email, {
        details: { reason: 'invalid_email' },
      });
    case '45422':
      throw new ApiError('validation_failed', JIRA_CONNECTION_MESSAGES.token_required, {
        details: { reason: 'token_required' },
      });
    default:
      break;
  }
  console.error('workspace Jira connection RPC failed', { code: error.code });
  throw new ApiError('internal_error', 'The Jira connection could not be saved.');
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

const EMAIL_FIELD = z.email().max(254);
const TOKEN_FIELD = z.string().trim().min(1).max(2048);

export const JiraConnectionPutBodySchema = z.object({
  site_url: z.string().max(2048),
  email: EMAIL_FIELD,
  api_token: TOKEN_FIELD.optional(),
}).strict();

// All three together to test unsaved values, or nothing to test the stored connection.
export const JiraConnectionCheckBodySchema = z.object({
  site_url: z.string().max(2048).optional(),
  email: EMAIL_FIELD.optional(),
  api_token: TOKEN_FIELD.optional(),
}).strict();

// Parses a body with a constant-message 422. The zod issue text is never echoed:
// it can carry the offending value (an email, a token).
export function parseJiraConnectionBody<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (result.success) {
    return result.data;
  }
  const path = result.error.issues[0]?.path[0];
  if (path === 'email') {
    throw new ApiError('validation_failed', JIRA_CONNECTION_MESSAGES.invalid_email, {
      details: { reason: 'invalid_email' },
    });
  }
  if (path === 'api_token') {
    throw new ApiError('validation_failed', JIRA_CONNECTION_MESSAGES.token_required, {
      details: { reason: 'token_required' },
    });
  }
  throw new ApiError('validation_failed', 'Request body failed validation.', {
    details: { reason: 'invalid_body', field: typeof path === 'string' ? path : null },
  });
}

// The public shape of a stored connection, for admins. Never the token.
export function toConnectedShape(meta: JiraConnectionMeta) {
  return {
    connected: true as const,
    site_url: meta.site_url,
    email: meta.email,
    has_token: true as const,
    updated_at: meta.updated_at,
    updated_by: meta.updated_by,
  };
}
