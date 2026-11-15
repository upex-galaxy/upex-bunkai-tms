import type { Deps, Prompter } from '../deps';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromptCancelled } from '../errors';

// Test doubles shared by the CLI's unit tests. Nothing here talks to a real
// server: `fakeApi` answers by route, and records every request so tests can
// assert what was (and was not) sent.

export interface RecordedRequest {
  method: string
  url: URL
  headers: Record<string, string>
  body: unknown
}

export type Route = (req: RecordedRequest) => { status: number, body?: unknown, headers?: Record<string, string> } | Promise<never>;

export function fakeApi(routes: Record<string, Route>): { fetch: typeof fetch, requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const req: RecordedRequest = {
      method: init?.method ?? 'GET',
      url,
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(req);
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'no fake route' } }), { status: 404 });
    }
    const answer = await route(req);
    return new Response(answer.body === undefined ? '' : JSON.stringify(answer.body), { status: answer.status, headers: answer.headers });
  };
  return { fetch: impl as unknown as typeof fetch, requests };
}

export interface Captured { text: string }

export function capture(): { stream: { write: (s: string) => boolean }, out: Captured } {
  const out: Captured = { text: '' };
  return { stream: { write: (s: string) => { out.text += s; return true; } }, out };
}

// Answers prompts in order; `cancel` makes that prompt behave like Ctrl+C.
export function scriptedPrompter(answers: Array<string | 'cancel'>): Prompter & { asked: string[] } {
  const asked: string[] = [];
  const next = async (label: string): Promise<string> => {
    asked.push(label);
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error(`unexpected prompt: ${label}`);
    }
    if (answer === 'cancel') {
      throw new PromptCancelled();
    }
    return answer;
  };
  return { text: next, secret: next, asked };
}

export function tempConfigDir(): { dir: string, path: string, cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'bunkai-cli-test-'));
  return { dir, path: join(dir, 'bunkai', 'credentials.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function fakeDeps(overrides: Partial<Deps> & Pick<Deps, 'fetch' | 'credentialsPath'>): Deps & { stdoutText: () => string, stderrText: () => string } {
  const stdout = capture();
  const stderr = capture();
  return {
    env: {},
    stdout: stdout.stream,
    stderr: stderr.stream,
    prompt: scriptedPrompter([]),
    hostname: () => 'test-host',
    now: () => new Date('2026-11-15T12:00:00Z'),
    ...overrides,
    stdoutText: () => stdout.out.text,
    stderrText: () => stderr.out.text,
  };
}
