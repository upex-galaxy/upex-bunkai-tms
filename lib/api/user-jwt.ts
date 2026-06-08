// Short-lived, user-scoped JWT signed (HS256) with the Supabase JWT secret.
//
// Purpose: a Bearer-PAT request has no Supabase session, so `auth.uid()` is null
// and every RLS policy denies it. Minting a JWT whose `sub` is the token's user
// lets PostgREST resolve `auth.uid()` / `auth.role()` for that user, so the SAME
// RLS that protects the browser session also scopes the PAT caller — one
// authorization model for both auth methods (see ADR-0001).
//
// SECURITY:
//   - TTL is intentionally tiny (60s): the token is minted per request and used
//     immediately for the impersonating Supabase client. It is never returned to
//     a caller, never persisted, and MUST never be logged.
//   - Claims are minimal: `sub` (the user) + `role: 'authenticated'`. No PAT
//     scopes leak into the JWT — capability gating happens in the API layer
//     (`requireCapability`), not in Postgres.
//   - Signed with SUPABASE_JWT_SECRET (the same secret GoTrue uses), so the
//     token is indistinguishable from a real user session to PostgREST.

const TTL_SECONDS = 60;

// Pure: takes the signing secret explicitly so it stays unit-testable without
// pulling the server-only env module. `principal.ts` injects env.SUPABASE_JWT_SECRET.
export async function mintUserJwt(userId: string, secret: string): Promise<string> {
  if (!secret) {
    // Fail fast: without the JWT secret a PAT caller cannot be impersonated, so
    // RLS would silently deny everything. Surface the missing-config cause.
    throw new Error('SUPABASE_JWT_SECRET is required to authenticate Bearer-PAT requests.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + TTL_SECONDS,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = await hmacSha256(signingInput, secret);
  return `${signingInput}.${signature}`;
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Buffer.from(new Uint8Array(signature)).toString('base64url');
}
