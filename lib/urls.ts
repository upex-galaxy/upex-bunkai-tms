// Centralised URL helpers. Single source of truth for redirects, OpenAPI
// servers list, email links, etc. Mirrors `.agents/project.yaml`
// `environments.*` so AI docs and runtime stay aligned.
//
// Environment detection uses Vercel system env vars (`VERCEL_ENV`), which are
// available in both server and client bundles without needing to be declared
// in `.env`. Local dev (no `VERCEL_ENV`) defaults to `local`.

export const APP_URLS = {
  local: 'http://localhost:3000',
  staging: 'https://staging-upexbunkai.vercel.app',
  production: 'https://upexbunkai.vercel.app',
} as const;

export type AppEnvironment = keyof typeof APP_URLS;

export function getEnvironment(): AppEnvironment {
  if (process.env.VERCEL_ENV === 'production') {
    return 'production';
  }
  if (process.env.VERCEL_ENV === 'preview') {
    return 'staging';
  }
  return 'local';
}

export function getBaseUrl(): string {
  return APP_URLS[getEnvironment()];
}

function normalisePath(path: string): string {
  if (path.length === 0) {
    return '';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export function webUrl(path: string = ''): string {
  return `${getBaseUrl()}${normalisePath(path)}`;
}

export function apiUrl(path: string = ''): string {
  return `${getBaseUrl()}/api${normalisePath(path)}`;
}

// Sentinel origin used only to resolve a candidate path; it is never emitted.
const SAFE_PATH_BASE = 'https://bunkai.invalid';
// Backslash, ASCII control characters (tab, CR, LF, ...) and DEL. Browsers
// rewrite `\` to `/` and strip tab/newline in special-scheme URLs, so
// `/\evil.com` and `/<TAB>/evil.com` both become `//evil.com` (BK-1827).
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_CHARS = /[\\\u0000-\u001F\u007F]/;

// Open-redirect guard. Returns an in-app, root-relative path, or `fallback`.
// The candidate is parsed with the WHATWG URL parser against a sentinel origin
// and accepted only when it still resolves to that origin; what comes back is
// the NORMALISED `pathname + search + hash`, never the raw input, so a browser
// can not reinterpret it as another host. Shared by the login form, the OAuth
// start + callback routes, and the magic-link form + route so the guard can not
// drift between consumers.
export function safeInternalPath(raw: string | null | undefined, fallback = '/projects'): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || UNSAFE_PATH_CHARS.test(raw)) {
    return fallback;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw, SAFE_PATH_BASE);
  }
  catch {
    return fallback;
  }
  // Dot segments can collapse into a protocol-relative path (`/.//evil.com`
  // parses to pathname `//evil.com`), which `router.push` would follow off-site.
  if (parsed.origin !== SAFE_PATH_BASE || parsed.pathname.startsWith('//')) {
    return fallback;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function isSafeInternalPath(raw: string): boolean {
  return safeInternalPath(raw, '') !== '';
}
