// Test-only helpers for the BK-231 billing component suites. Pure: this module
// imports neither React nor a DOM library, so a suite can register its own
// happy-dom (GlobalRegistrator) before it imports React. All DOM globals are
// read at call time, after registration.
//
// MOCK ONLY: no Stripe account exists for this project, so every populated
// state in these suites runs against a fetch double. Nothing here (or in the
// suites) talks to a live payment provider.

export interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  signal: AbortSignal | null
}

export type FetchHandler = (call: RecordedCall) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

function headersToRecord(headers: unknown): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) { return record; }
  new Headers(headers as HeadersInit).forEach((value, key) => { record[key.toLowerCase()] = value; });
  return record;
}

// Replaces `globalThis.fetch` with a recording double and returns the call log
// plus a restore function.
export function installFetchDouble(handler: FetchHandler) {
  const realFetch = globalThis.fetch;
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: headersToRecord(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
      signal: init?.signal ?? null,
    };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof globalThis.fetch;
  return {
    calls,
    restore: () => { globalThis.fetch = realFetch; },
  };
}

// React tracks the last value it wrote to an input, so assigning `.value`
// directly is swallowed. Going through the prototype setter and then firing a
// bubbling `input` event is what makes `onChange` run.
export function setInputValue(input: HTMLInputElement, value: string): void {
  // eslint-disable-next-line ts/unbound-method -- the native setter is invoked with an explicit receiver via .call
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
