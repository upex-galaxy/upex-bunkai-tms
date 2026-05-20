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
