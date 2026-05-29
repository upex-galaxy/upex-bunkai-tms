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
