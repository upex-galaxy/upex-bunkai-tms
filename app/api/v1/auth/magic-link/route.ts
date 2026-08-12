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

  // BK-400 (staged): this still sends through the SSR client, which
  // `@supabase/ssr` hard-codes to `flowType: 'pkce'` — so the emailed link is
  // still a PKCE link and still only completes in the browser that asked for it.
  // `/auth/callback` has grown a stateless `token_hash` rail that fixes the
  // cross-device case, but ACTIVATING it takes two changes that must land
  // together, because they are useless apart and harmful alone:
  //
  //   1. this client becomes non-PKCE (`flowType: 'implicit'`), so GoTrue stores
  //      a plain token hash. Under PKCE the stored hash is literally prefixed
  //      `pkce_` (verified in `auth.one_time_tokens`), and `verifyOtp` will not
  //      take it — so the token_hash rail cannot work while this stays PKCE.
  //   2. the Supabase magic-link email template stops using
  //      `{{ .ConfirmationURL }}` and links to exactly:
  //        {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink
  //      `&`, not `?` — `emailRedirectTo` above already carries `?next=`, so a
  //      `?` would fold the token into the `next` value. `.RedirectTo` rather
  //      than `.SiteURL` because `site_url` is pinned to localhost while one
  //      Supabase project backs local, staging and production.
  //
  // Flipping 1 without 2 breaks sign-in on EVERY device, not just other ones:
  // an implicit-flow client under the default template makes GoTrue return the
  // session in the URL *fragment*, which a server route can never read. Flipping
  // 2 without 1 mails a `pkce_` hash that fails to verify. The template is shared
  // by every environment, so 2 must not happen until this code is live in
  // production.
  const supabase = await createClient();
  // BK-175: `shouldCreateUser` defaults to TRUE, which turned this login-only
  // endpoint into a silent sign-up path. An address with no account was
  // enrolled instead of rejected, so Supabase sent the `Confirm signup`
  // template — a 6-digit code, not a magic link — while the caller sat on a
  // "Check your inbox" screen waiting for a link that never arrives. Pinning
  // it to false keeps the two flows apart: this route only ever mails a link
  // to an address that already has an account; enrolment belongs to /signup.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect, shouldCreateUser: false },
  });

  if (error) {
    const status = error.status ?? 502;
    if (status === 429) {
      throw new ApiError('rate_limited', error.message, { status });
    }
    // Anti-enumeration stance, mirroring `resend`/`signup`/`confirm`: a 4xx
    // here means "no account for this address" (the only 4xx `signInWithOtp`
    // raises once shouldCreateUser is false), and answering differently than
    // for a known address would turn this endpoint into an account oracle.
    // Report the same success the caller gets for a delivered link, and never
    // echo the raw upstream message.
    if (status >= 400 && status < 500) {
      return jsonResponse({ ok: true });
    }
    throw new ApiError('upstream_error', 'Magic-link delivery is temporarily unavailable.');
  }

  // Best-effort audit row for replay correlation. Failures here must never
  // fail the user-visible request — we already enqueued the email.
  void recordIssuance({
    email,
    ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  });

  return jsonResponse({ ok: true });
}, { auth: 'public' });

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
