// Account identity helpers — framework-agnostic (no React/Next/Bun coupling),
// per the Stack §10 utilities rule. Pure functions, unit-tested.

// Derive a 2-letter avatar label from an email address (BK-86, ratified
// Decision #1). Rules, in order:
//   1. Take the local-part (before `@`) and strip any `+tag` suffix.
//   2. Split on `.`/`-`/`_` into tokens; from the first 1-2 non-empty tokens,
//      take the first alphanumeric character of each, uppercased.
//   3. Single token -> first two alphanumerics of that token.
//   4. Numeric-only / no-letter local-part -> first two raw alphanumerics
//      (EC-1 fallback), so e.g. `12345@x.io` -> "12".
//   5. Empty / invalid input -> "?" (safe fallback; never throws).
export function emailInitials(email: string | null | undefined): string {
  if (!email) {
    return '?';
  }

  const at = email.indexOf('@');
  const localRaw = at === -1 ? email : email.slice(0, at);
  // Strip a `+tag` suffix (e.g. `elena+qa` -> `elena`).
  const local = localRaw.split('+')[0] ?? '';

  const tokens = local
    .split(/[.\-_]+/)
    .map(t => t.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean);

  if (tokens.length === 0) {
    return '?';
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}
