import { describe, expect, it } from 'bun:test';
import { resolveDisplayName } from './welcome-summary';

// BK-1949 Business Rule 7 — the Home banner's fallback order, as a decision
// table over (own name, provider name, email). The own name is read from
// `app_metadata`, where no provider sign-in writes.
describe('resolveDisplayName (Home welcome banner)', () => {
  it('greets with the full saved own name (AC 1.2, PO1)', () => {
    expect(resolveDisplayName({
      appMetadata: { display_name: 'Elena Vargas' },
      metadata: {},
      email: 'evargas@acme.io',
    })).toBe('Elena Vargas');
  });

  it('keeps the own name over a provider name, even after a provider refresh (AC 1.5, E16)', () => {
    expect(resolveDisplayName({
      appMetadata: { display_name: 'Elena V.', provider: 'google' },
      metadata: { full_name: 'Elena Vargas-Ruiz' },
      email: 'elena@acme.io',
    })).toBe('Elena V.');
  });

  it('falls back to the provider name with no own name (AC 3.2)', () => {
    expect(resolveDisplayName({
      appMetadata: { provider: 'google' },
      metadata: { full_name: 'Elena Vargas' },
      email: 'evargas@acme.io',
    })).toBe('Elena Vargas');
    expect(resolveDisplayName({ metadata: { name: 'Elena GH' }, email: 'x@acme.io' })).toBe('Elena GH');
  });

  it('falls back to the email guess with neither name (AC 3.1)', () => {
    expect(resolveDisplayName({ appMetadata: {}, metadata: {}, email: 'elena.vargas@acme.io' })).toBe('Elena Vargas');
    expect(resolveDisplayName({ appMetadata: {}, metadata: {}, email: 'evargas@acme.io' })).toBe('Evargas');
  });

  it('returns null for an email without letters and no names (AC 3.3)', () => {
    expect(resolveDisplayName({ appMetadata: {}, metadata: {}, email: '12345@x.io' })).toBeNull();
  });

  it('shows markup in the saved name as the literal string (AC 2.7)', () => {
    expect(resolveDisplayName({ appMetadata: { display_name: '<b>Elena</b>' }, email: 'e@x.io' })).toBe('<b>Elena</b>');
  });
});
