// BK-1170 — the one canonical shape of a workspace's Jira site URL. Every place
// that stores, sends or probes a site URL goes through here, so a credential can
// only ever be sent to `https://<name>.atlassian.net`. The same rule is repeated
// by the table CHECK and the RPC in migration 0119.

export const JIRA_SITE_HOST_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/;

// Returns `https://<host>` or null. Rejects http, other hosts (including
// look-alikes such as acme.atlassian.net.evil.com), userinfo, ports, paths,
// queries and fragments.
export function normalizeJiraSiteUrl(raw: string): string | null {
  const candidate = raw.trim().toLowerCase().replace(/\/+$/, '');
  if (candidate === '') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  }
  catch {
    return null;
  }
  if (url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.port !== ''
    || url.search !== ''
    || url.hash !== ''
    || (url.pathname !== '' && url.pathname !== '/')) {
    return null;
  }
  if (!JIRA_SITE_HOST_PATTERN.test(url.hostname)) {
    return null;
  }
  return `https://${url.hostname}`;
}
