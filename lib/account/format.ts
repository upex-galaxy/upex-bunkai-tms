// Identity-card date formatting (BK-87) — framework-agnostic, no Date-locale
// surprises: format deterministically as UTC so server and client renders
// (and any timezone the reader is in) always show the same string.

const NOT_AVAILABLE = 'Not available';

// "Member since" — the active workspace's `joined_at` (date only, matches the
// mockup's `.value.mono` field, e.g. "2025-11-03"). Null when the caller has
// no active workspace (Scenario B, no membership yet).
export function formatMemberSince(joinedAt: string | null | undefined): string {
  if (!joinedAt) {
    return NOT_AVAILABLE;
  }
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) {
    return NOT_AVAILABLE;
  }
  return date.toISOString().slice(0, 10);
}

// "Last active" — `auth.users.last_sign_in_at` (date + time, UTC, matches the
// mockup's e.g. "2026-07-30 08:52 UTC"). Null covers both a lookup failure
// (best-effort admin API call) and a user who has never completed a sign-in.
export function formatLastActive(lastSignInAt: string | null | undefined): string {
  if (!lastSignInAt) {
    return NOT_AVAILABLE;
  }
  const date = new Date(lastSignInAt);
  if (Number.isNaN(date.getTime())) {
    return NOT_AVAILABLE;
  }
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
