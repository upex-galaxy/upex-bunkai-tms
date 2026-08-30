import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Shim `server-only` so the module graph loads under Bun (harmless
// everywhere it's imported — unlike mocking `@lib/env`, this never leaks
// behavior into another test file's assertions).
void mock.module('server-only', () => ({}));

// A minimal fake of the `resend` package's `Resend` class — no real network
// call, ever. `sendImpl` is reassigned per test so both the success and
// failure branches are exercised against the SAME mocked module.
let sendImpl: () => Promise<{ data: unknown, error: unknown }> = async () => ({ data: { id: 'email-1' }, error: null });
class FakeResend {
  apiKey: string;
  constructor(apiKey: string) { this.apiKey = apiKey; }
  emails = { send: async (..._args: unknown[]) => sendImpl() };
}
void mock.module('resend', () => ({ Resend: FakeResend }));

const { sendDigestEmail } = await import('./resend-client');

const config = { apiKey: 'test-key', fromEmail: 'Bunkai <digest@bunkai.example>' };

describe('sendDigestEmail — apiKey configured', () => {
  beforeEach(() => {
    sendImpl = async () => ({ data: { id: 'email-1' }, error: null });
  });

  test('returns ok:true on a successful send', async () => {
    const result = await sendDigestEmail({ to: 'user@example.com', subject: 'subj', html: '<p>hi</p>' }, config);
    expect(result).toEqual({ ok: true });
  });

  test('returns ok:false with the error name/message on an API error', async () => {
    sendImpl = async () => ({ data: null, error: { name: 'invalid_from_address', message: 'Domain not verified' } });
    const result = await sendDigestEmail({ to: 'user@example.com', subject: 'subj', html: '<p>hi</p>' }, config);
    expect(result).toEqual({ ok: false, error: 'invalid_from_address: Domain not verified' });
  });
});

describe('sendDigestEmail — apiKey unset', () => {
  test('resolves resend_not_configured without attempting a send', async () => {
    const result = await sendDigestEmail(
      { to: 'user@example.com', subject: 'subj', html: '<p>hi</p>' },
      { apiKey: undefined, fromEmail: config.fromEmail },
    );
    expect(result).toEqual({ ok: false, error: 'resend_not_configured' });
  });
});
