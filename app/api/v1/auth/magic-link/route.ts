import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { createClient } from '@lib/supabase/server';
import { webUrl } from '@lib/urls';
import { z } from 'zod';

// RFC 5321 §4.5.3.1.3 — local-part 64 + "@" + domain 255 = max 320. The
// pragmatic ceiling most providers honour is 254 (the SMTP MAIL FROM path
// limit), so we enforce that.
const EMAIL_MAX_LENGTH = 254;

const BodySchema = z.object({
  email: z.string().email().max(EMAIL_MAX_LENGTH),
  // Root-relative path the user should land on after the OTP exchange.
  // Validated again in `/auth/callback` (open-redirect guard) so we can keep
  // this check loose.
  next: z
    .string()
    .min(1)
    .refine(value => value.startsWith('/') && !value.startsWith('//'), {
      message: 'next must be a root-relative path (e.g. /projects).',
    })
    .optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const body: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });

  const { email, next = '/projects' } = BodySchema.parse(body);
  const redirect = `${webUrl('/auth/callback')}?next=${encodeURIComponent(next)}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect },
  });

  if (error) {
    // Supabase rate-limit (HTTP 429) surfaces here. Phase F adds a real
    // rate-limit middleware in front; for now we map the upstream verbatim.
    const status = error.status ?? 502;
    throw new ApiError(
      status === 429 ? 'rate_limited' : 'upstream_error',
      error.message,
      { status },
    );
  }

  // Best-effort audit row for replay correlation. Failures here must never
  // fail the user-visible request — we already enqueued the email.
  void recordIssuance({
    email,
    ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  });

  return jsonResponse({ ok: true });
});

interface IssuanceMeta {
  email: string
  ip: string | null
  userAgent: string | null
}

async function recordIssuance(meta: IssuanceMeta): Promise<void> {
  try {
    const tokenHash = await sha256Hex(
      `${meta.email}:${Date.now()}:${crypto.randomUUID()}`,
    );
    const ipHash = meta.ip ? await sha256Hex(meta.ip) : null;
    const admin = createAdminClient();
    const { data: inserted, error } = await admin
      .from('magic_link_tokens')
      .insert({
        email: meta.email,
        user_agent: meta.userAgent?.slice(0, 512) ?? null,
      })
      .select('id')
      .single();
    if (error || !inserted) {
      return;
    }
    // Secret material lives in a sibling table QA/analytics roles cannot read.
    await admin.from('magic_link_token_secrets').insert({
      magic_link_token_id: inserted.id,
      token_hash: tokenHash,
      ip_hash: ipHash,
    });
  }
  catch {
    // Swallow — audit is best-effort. Do not break the auth flow.
  }
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
