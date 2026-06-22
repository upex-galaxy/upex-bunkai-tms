import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';

// Shared PAT minting helper. Used by POST /api/v1/tokens (session-issued),
// /api/v1/auth/signin (password flow), and /api/v1/auth/signup (provisioning).

const TOKEN_FAMILY_PREFIX = 'bk_pat_';
const TOKEN_PREFIX_LENGTH = 12;
const SECRET_BYTES = 32;

export type AccessTokenScope = 'atc:read' | 'atc:write' | 'run:execute' | 'workspace:admin';

export const ALLOWED_PAT_SCOPES: readonly AccessTokenScope[] = [
  'atc:read',
  'atc:write',
  'run:execute',
  'workspace:admin',
] as const;

// Default scopes for headless bootstrap (sign-in / sign-up). Deliberately
// EXCLUDES workspace:admin — an admin-scoped token must be minted explicitly
// against a specific workspace via POST /api/v1/tokens. See ADR-0005 / BK-135.
export const DEFAULT_PAT_SCOPES: readonly AccessTokenScope[] = [
  'atc:read',
  'atc:write',
  'run:execute',
] as const;

// Headless auth flows take no workspace_id, so they can never satisfy the
// workspace:admin issuance rule (a specific workspace + admin/owner role).
// Reject the scope outright there. See ADR-0005.
export function assertNoGlobalAdminScope(scopes: AccessTokenScope[]): void {
  if (scopes.includes('workspace:admin')) {
    throw new ApiError(
      'forbidden',
      'workspace:admin tokens cannot be issued via headless auth; use POST /api/v1/tokens with a workspace_id.',
    );
  }
}

export interface AssertTokenIssuanceArgs {
  db: SupabaseClient<Database>
  userId: string
  scopes: AccessTokenScope[]
  workspaceId: string | null
}

// Role-gate for session-issued tokens (POST /api/v1/tokens). A workspace:admin
// scope requires the caller to be admin/owner in the SPECIFIC target workspace;
// any workspace_id at all requires active membership. Mirrors the invites
// endpoint role check and uses the RLS-scoped client. See ADR-0005 / BK-135.
export async function assertTokenIssuanceAuthorized(args: AssertTokenIssuanceArgs): Promise<void> {
  const wantsAdmin = args.scopes.includes('workspace:admin');

  if (wantsAdmin && !args.workspaceId) {
    throw new ApiError(
      'forbidden',
      'workspace:admin tokens must target a specific workspace (workspace_id required).',
    );
  }

  // Global token with non-admin scopes only — allowed (AI-agent / cross-workspace
  // enumeration use case). No membership to check.
  if (!args.workspaceId) {
    return;
  }

  const { data: membership, error } = await args.db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', args.workspaceId)
    .eq('user_id', args.userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!membership) {
    throw new ApiError('forbidden', 'You are not a member of the target workspace.');
  }
  if (wantsAdmin && !['admin', 'owner'].includes(membership.role)) {
    throw new ApiError(
      'forbidden',
      'Only workspace admins or owners can issue workspace:admin tokens.',
    );
  }
}

export interface MintPatArgs {
  admin: SupabaseClient<Database>
  userId: string
  name?: string | null
  workspaceId?: string | null
  scopes: AccessTokenScope[]
  expiresInDays?: number | null
}

export interface MintedPat {
  id: string
  token: string
  name: string | null
  scopes: AccessTokenScope[]
  workspace_id: string | null
  expires_at: string | null
  created_at: string
}

export async function mintPat(args: MintPatArgs): Promise<MintedPat> {
  const secret = generateSecret(SECRET_BYTES);
  const tokenPrefix = secret.slice(0, TOKEN_PREFIX_LENGTH);
  const hash = await sha256Hex(secret);
  const expiresAt = args.expiresInDays
    ? new Date(Date.now() + args.expiresInDays * 86_400_000).toISOString()
    : null;

  const { data: inserted, error } = await args.admin
    .from('access_tokens')
    .insert({
      user_id: args.userId,
      workspace_id: args.workspaceId ?? null,
      name: args.name ?? null,
      token_prefix: tokenPrefix,
      scopes: args.scopes,
      expires_at: expiresAt,
    })
    .select('id, name, scopes, workspace_id, expires_at, created_at')
    .single();

  if (error || !inserted) {
    throw new ApiError('internal_error', error?.message ?? 'Failed to mint token.');
  }

  // Secret hash lives in a sibling table that QA/analytics roles cannot read.
  const { error: secretError } = await args.admin
    .from('access_token_secrets')
    .insert({ token_id: inserted.id, hash });

  if (secretError) {
    throw new ApiError('internal_error', secretError.message);
  }

  return {
    id: inserted.id,
    token: `${TOKEN_FAMILY_PREFIX}${tokenPrefix}.${secret.slice(TOKEN_PREFIX_LENGTH)}`,
    name: inserted.name,
    scopes: inserted.scopes as AccessTokenScope[],
    workspace_id: inserted.workspace_id,
    expires_at: inserted.expires_at,
    created_at: inserted.created_at,
  };
}

function generateSecret(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
