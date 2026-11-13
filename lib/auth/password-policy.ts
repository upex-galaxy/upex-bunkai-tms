import { z } from 'zod';

// BK-1829 — password contract for NEW accounts (sign-up).
//
// The auth provider (GoTrue) hashes with bcrypt, which reads at most 72 BYTES;
// GoTrue refuses anything longer. The limit is therefore bytes, not characters:
// 72 for plain ASCII, fewer when the password carries accents or symbols
// (2-4 bytes each in UTF-8). Validating it here turns the provider's opaque
// refusal into a 422 `too_big` that names the limit.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .superRefine((value, ctx) => {
    if (passwordByteLength(value) > PASSWORD_MAX_BYTES) {
      ctx.addIssue({
        code: 'too_big',
        origin: 'string',
        maximum: PASSWORD_MAX_BYTES,
        inclusive: true,
        input: value,
        message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes (${PASSWORD_MAX_BYTES} characters without accents or symbols).`,
      });
    }
  });
