import { NewPasswordSchema, PASSWORD_MAX_BYTES, passwordByteLength } from '@lib/auth/password-policy';
import { describe, expect, it } from 'bun:test';

// BK-1829 — sign-up passwords: 8 characters up to 72 UTF-8 bytes (bcrypt limit).
describe('NewPasswordSchema', () => {
  it.each([8, 9, 64, 72])('accepts an ASCII password of %i characters', (n) => {
    expect(NewPasswordSchema.safeParse('a'.repeat(n)).success).toBe(true);
  });

  it('refuses 7 characters with too_small', () => {
    const result = NewPasswordSchema.safeParse('a'.repeat(7));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe('too_small');
  });

  it.each([73, 100, 127, 128, 129])('refuses an ASCII password of %i characters with too_big, maximum 72', (n) => {
    const result = NewPasswordSchema.safeParse('a'.repeat(n));
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0] as { code?: string, maximum?: number, message?: string } | undefined;
    expect(issue?.code).toBe('too_big');
    expect(issue?.maximum).toBe(PASSWORD_MAX_BYTES);
    expect(issue?.message).toContain('72 bytes');
  });

  it('counts bytes, not characters: 40 accented letters are 80 bytes', () => {
    const accented = 'é'.repeat(40);
    expect(accented.length).toBe(40);
    expect(passwordByteLength(accented)).toBe(80);
    expect(NewPasswordSchema.safeParse(accented).success).toBe(false);
    expect(NewPasswordSchema.safeParse('é'.repeat(36)).success).toBe(true);
  });
});
