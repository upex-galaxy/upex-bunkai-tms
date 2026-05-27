// Active-workspace cookie name + builder. We keep the cookie separate from the
// Supabase auth cookie so rotating the active workspace never touches the JWT.

export const ACTIVE_WORKSPACE_COOKIE = 'bk_active_ws';

export interface ActiveWorkspaceCookieOptions {
  workspaceId: string
}

export const ACTIVE_WORKSPACE_COOKIE_DEFAULTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // Honour the deployment URL; falls back to `secure: false` in non-https dev.
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  // 90 days; the cookie is a soft preference, not auth.
  maxAge: 60 * 60 * 24 * 90,
};
