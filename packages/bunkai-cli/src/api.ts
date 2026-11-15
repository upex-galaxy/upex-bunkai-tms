import { CliError } from './errors';

// The public API the CLI talks to. A pure HTTP client: nothing here imports the
// app's server code, so the package can be published on its own later.

export const DEFAULT_API_URL = 'https://upexbunkai.vercel.app';
export const REQUEST_TIMEOUT_MS = 30_000;

export interface ApiErrorEnvelope {
  code?: string
  message?: string
  details?: unknown
}

export interface ApiResponse {
  status: number
  body: unknown
  headers: Headers
}

// The `error` object of the API's canonical envelope, when the body has one.
export function errorOf(response: ApiResponse): ApiErrorEnvelope {
  const body = response.body as { error?: ApiErrorEnvelope } | null;
  return body && typeof body === 'object' && body.error && typeof body.error === 'object' ? body.error : {};
}

// `--api-url` / `BUNKAI_API_URL` / the saved value, normalised to an origin
// with no trailing slash. Anything that is not an http(s) URL is refused.
export function normalizeApiUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  }
  catch {
    throw new CliError(`The API URL "${raw}" is not a valid URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new CliError(`The API URL "${raw}" must start with https:// or http://.`);
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  body?: unknown
  token?: string
}

export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {}

  async request(path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    }
    catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new CliError(timedOut
        ? `Bunkai at ${this.baseUrl} did not answer within ${Math.round(this.timeoutMs / 1000)} s. Check your connection and try again.`
        : `Could not reach Bunkai at ${this.baseUrl}. Check your connection and try again.`);
    }

    const text = await response.text().catch(() => '');
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      }
      catch {
        body = null;
      }
    }
    if (response.status >= 500) {
      const requestId = response.headers.get('x-request-id');
      throw new CliError(`Bunkai answered with a server error (${response.status}). Try again in a moment${requestId ? `; quote request id ${requestId} if it keeps failing` : ''}.`);
    }
    return { status: response.status, body, headers: response.headers };
  }
}
