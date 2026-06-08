import { mintUserJwt } from '@lib/api/user-jwt';
import { describe, expect, it } from 'bun:test';

const SECRET = 'test-jwt-secret-at-least-32-bytes-long-xxxxx';

// These tests prove the minted token is a well-formed, correctly-signed Supabase
// user JWT — the mechanism that lets a PAT caller pass Postgres RLS as its user
// (ADR-0001, Path B). RLS isolation itself is proven by a live round-trip smoke,
// not here; this file guards the token's shape, claims, and signature.

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

async function verifyHs256(signingInput: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    Buffer.from(signature, 'base64url'),
    new TextEncoder().encode(signingInput),
  );
}

describe('mintUserJwt', () => {
  const userId = '00000000-0000-4000-8000-000000000001';

  it('produces a three-segment JWT', async () => {
    const token = await mintUserJwt(userId, SECRET);
    expect(token.split('.')).toHaveLength(3);
  });

  it('uses the HS256 header', async () => {
    const [header] = (await mintUserJwt(userId, SECRET)).split('.');
    expect(decodeSegment(header)).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('carries the minimal authenticated-user claims', async () => {
    const [, payload] = (await mintUserJwt(userId, SECRET)).split('.');
    const claims = decodeSegment(payload);
    expect(claims.sub).toBe(userId);
    expect(claims.role).toBe('authenticated');
    expect(claims.aud).toBe('authenticated');
    expect((claims.exp as number) - (claims.iat as number)).toBe(60);
  });

  it('does not leak PAT scopes or extra claims into the token', async () => {
    const [, payload] = (await mintUserJwt(userId, SECRET)).split('.');
    expect(Object.keys(decodeSegment(payload)).sort()).toEqual(['aud', 'exp', 'iat', 'role', 'sub']);
  });

  it('is signed with the provided secret', async () => {
    const token = await mintUserJwt(userId, SECRET);
    const [header, payload, signature] = token.split('.');
    expect(await verifyHs256(`${header}.${payload}`, signature, SECRET)).toBe(true);
  });

  it('rejects a signature checked against the wrong secret', async () => {
    const token = await mintUserJwt(userId, SECRET);
    const [header, payload, signature] = token.split('.');
    expect(await verifyHs256(`${header}.${payload}`, signature, 'not-the-secret')).toBe(false);
  });
});
