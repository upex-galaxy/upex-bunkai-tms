import { describe, expect, it } from 'bun:test';
import { isReservedEmailDomain } from './reserved-email-domain';

describe('BK-1877 — isReservedEmailDomain', () => {
  it.each([
    'someone@example.com',
    'someone@example.net',
    'someone@example.org',
    'someone@EXAMPLE.COM',
    'someone@example.com.',
    'someone@mail.example.com',
    'someone@a.b.example.org',
    'someone@anything.example',
    'someone@foo.test',
    'someone@example.test',
    'someone@host.invalid',
    'someone@machine.localhost',
    'someone@printer.local',
    'someone@Printer.LOCAL',
  ])('flags %s as reserved', (email) => {
    expect(isReservedEmailDomain(email)).toBe(true);
  });

  it.each([
    'someone@gmail.com',
    'someone@delgri.resend.app',
    'someone@bunkai.io',
    'someone@notexample.com',
    'someone@example.com.ar',
    'someone@example.co',
    'someone@examples.org',
    'someone@test.com',
    'someone@testing.dev',
    'someone@locality.net',
    'example.com@gmail.com',
  ])('accepts %s', (email) => {
    expect(isReservedEmailDomain(email)).toBe(false);
  });
});
