import { describe, expect, it } from 'bun:test';
import { normalizeJiraSiteUrl } from './site-url';

// BK-1170 — the one gate that decides where a workspace's Jira credential may be sent.

describe('normalizeJiraSiteUrl: accepted', () => {
  it('keeps a canonical Atlassian Cloud site', () => {
    expect(normalizeJiraSiteUrl('https://acme.atlassian.net')).toBe('https://acme.atlassian.net');
  });

  it('lower-cases, trims and strips trailing slashes', () => {
    expect(normalizeJiraSiteUrl('  HTTPS://Acme.Atlassian.NET/ ')).toBe('https://acme.atlassian.net');
    expect(normalizeJiraSiteUrl('https://acme-qa.atlassian.net///')).toBe('https://acme-qa.atlassian.net');
  });
});

describe('normalizeJiraSiteUrl: rejected', () => {
  const rejected: [string, string][] = [
    ['http scheme', 'http://acme.atlassian.net'],
    ['another host', 'https://acme.example.com'],
    ['look-alike suffix', 'https://acme.atlassian.net.evil.com'],
    ['host smuggled in the path', 'https://evil.com/.atlassian.net'],
    ['userinfo', 'https://user:pass@acme.atlassian.net'],
    ['userinfo that hides the real host', 'https://acme.atlassian.net@evil.com'],
    ['port', 'https://acme.atlassian.net:8443'],
    ['path', 'https://acme.atlassian.net/jira'],
    ['query', 'https://acme.atlassian.net/?a=b'],
    ['fragment', 'https://acme.atlassian.net/#x'],
    ['bare atlassian.net', 'https://atlassian.net'],
    ['no scheme', 'acme.atlassian.net'],
    ['empty', ''],
    ['whitespace only', '   '],
  ];
  for (const [name, value] of rejected) {
    it(`rejects ${name}`, () => {
      expect(normalizeJiraSiteUrl(value)).toBeNull();
    });
  }
});
