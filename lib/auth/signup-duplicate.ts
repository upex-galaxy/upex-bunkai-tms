// BK-1831 — concurrent duplicate sign-ups.
//
// Two parallel `auth.signUp` calls for one fresh address race on the unique
// index over the email. The loser gets a GoTrue 5xx (`unexpected_failure`,
// SQLSTATE 23505 underneath); a call that lands just after the winner
// committed finds the pending account, tries to resend its code and hits the
// per-address cooldown (429 `over_email_send_rate_limit`). Neither is the
// caller's fault, and the account they asked for exists.
//
// For exactly those two upstream answers the route looks the address up and
// answers like the winner did. The unique index makes the loser fail only
// after the winner committed, so the lookup sees the winner's row. Any other
// error, an unknown address or a failed lookup keeps the normal mapping, so a
// real outage still surfaces as 502.

export interface SignupUpstreamError {
  status?: number
  code?: string
}

export interface EmailStatus {
  exists: boolean
  confirmed: boolean
}

export type DuplicateSignupOutcome = 'pending' | 'confirmed' | null;

export function mayBeDuplicateSignup(error: SignupUpstreamError): boolean {
  const status = error.status ?? 502;
  return status >= 500 || (status === 429 && error.code === 'over_email_send_rate_limit');
}

export async function resolveDuplicateSignup(
  error: SignupUpstreamError,
  lookup: () => Promise<EmailStatus | null>,
): Promise<DuplicateSignupOutcome> {
  if (!mayBeDuplicateSignup(error)) {
    return null;
  }
  const status = await lookup().catch(() => null);
  if (!status?.exists) {
    return null;
  }
  return status.confirmed ? 'confirmed' : 'pending';
}
