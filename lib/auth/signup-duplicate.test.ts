import type { EmailStatus } from './signup-duplicate';
import { describe, expect, it } from 'bun:test';
import { mayBeDuplicateSignup, resolveDuplicateSignup } from './signup-duplicate';

function lookupReturning(status: EmailStatus | null) {
  const calls: number[] = [];
  const lookup = async () => {
    calls.push(1);
    return status;
  };
  return { lookup, calls };
}

describe('BK-1831 — mayBeDuplicateSignup', () => {
  it.each([
    [{ status: 500, code: 'unexpected_failure' }, true],
    [{ status: 503 }, true],
    [{}, true],
    [{ status: 429, code: 'over_email_send_rate_limit' }, true],
    [{ status: 429, code: 'over_request_rate_limit' }, false],
    [{ status: 400, code: 'validation_failed' }, false],
    [{ status: 422, code: 'weak_password' }, false],
  ])('%o -> %p', (error, expected) => {
    expect(mayBeDuplicateSignup(error)).toBe(expected);
  });
});

describe('BK-1831 — resolveDuplicateSignup', () => {
  it('answers pending when the race loser finds the winner\'s pending account', async () => {
    const { lookup } = lookupReturning({ exists: true, confirmed: false });
    expect(await resolveDuplicateSignup({ status: 500, code: 'unexpected_failure' }, lookup)).toBe('pending');
  });

  it('answers pending when the per-address cooldown fires on a pending account', async () => {
    const { lookup } = lookupReturning({ exists: true, confirmed: false });
    expect(await resolveDuplicateSignup({ status: 429, code: 'over_email_send_rate_limit' }, lookup)).toBe('pending');
  });

  it('answers confirmed when the account is already confirmed', async () => {
    const { lookup } = lookupReturning({ exists: true, confirmed: true });
    expect(await resolveDuplicateSignup({ status: 500 }, lookup)).toBe('confirmed');
  });

  it('keeps the normal mapping when no account exists (a real outage)', async () => {
    const { lookup } = lookupReturning({ exists: false, confirmed: false });
    expect(await resolveDuplicateSignup({ status: 500 }, lookup)).toBeNull();
  });

  it('keeps the normal mapping when the lookup fails or throws', async () => {
    expect(await resolveDuplicateSignup({ status: 500 }, async () => null)).toBeNull();
    expect(await resolveDuplicateSignup({ status: 500 }, async () => {
      throw new Error('directory down');
    })).toBeNull();
  });

  it('does not look the address up for other errors', async () => {
    const { lookup, calls } = lookupReturning({ exists: true, confirmed: false });
    expect(await resolveDuplicateSignup({ status: 429, code: 'over_request_rate_limit' }, lookup)).toBeNull();
    expect(await resolveDuplicateSignup({ status: 400 }, lookup)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
