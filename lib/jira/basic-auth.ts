// HTTP Basic header for Jira Cloud (email + API token). btoa() throws on anything
// outside Latin-1, so encode through UTF-8 bytes instead; the value never leaves the request.
export function jiraBasicAuthHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`;
}
