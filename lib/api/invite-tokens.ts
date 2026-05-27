// Shared helpers for the workspace-invite token format.
//
// Token shape: `bk_inv_<base64url-secret>` (~256 bits of entropy).
// We store ONLY the SHA-256 of the secret in `workspace_invites.token_hash`,
// so a database leak does not yield redeemable invites.

const TOKEN_PREFIX = 'bk_inv_';
const SECRET_BYTES = 32;

export function generateInviteToken(): string {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + base64UrlEncode(bytes);
}

export async function hashInviteToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export { TOKEN_PREFIX as INVITE_TOKEN_PREFIX };
