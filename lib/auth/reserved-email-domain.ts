// BK-1877 — sign-up refuses reserved email domains.
//
// Sign-up must mail a 6-digit code before the account can exist. The mail
// provider refuses reserved domains outright (`550 Invalid to field ... domains
// like example.com`); GoTrue relays that as a generic 500
// (`unexpected_failure`, the same code a real SMTP outage gets) and rolls the
// new user back, so the route used to answer 502. These domains can never
// receive the code, whatever the provider: refuse them up front with a 422.
//
// The list is the IETF reserved set only (RFC 2606, RFC 6761, RFC 6762 for
// `.local`), never a guess at the provider's private blocklist.

const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'] as const;
const RESERVED_TLDS = ['example', 'test', 'invalid', 'localhost', 'local'] as const;

export const RESERVED_EMAIL_DOMAIN_MESSAGE
  = 'Email uses a reserved domain (such as example.com or .test) that cannot receive the verification code. Use an address you can read.';

// True when the address's domain is reserved: one of the reserved second-level
// domains or a subdomain of one, or any name under a reserved TLD.
// Case-insensitive, and one trailing dot (the DNS root) is ignored.
export function isReservedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) {
    return false;
  }
  const domain = email.slice(at + 1).toLowerCase().replace(/\.$/, '');
  if (RESERVED_DOMAINS.some(reserved => domain === reserved || domain.endsWith(`.${reserved}`))) {
    return true;
  }
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return (RESERVED_TLDS as readonly string[]).includes(tld);
}
