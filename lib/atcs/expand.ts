// BK-595 — `expand` query parser for GET /api/v1/atcs/{id}.
// Rules: comma-separated; values are trimmed and case-insensitive; empty
// segments and duplicates are ignored; repeated `expand` params are merged.
// Any unrecognised value is refused (never silently dropped).

export const ATC_EXPANSIONS = ['steps', 'assertions', 'acceptance_criteria', 'used_in'] as const;
export type AtcExpansion = (typeof ATC_EXPANSIONS)[number];

export type ParsedExpand = { ok: true, expansions: Set<AtcExpansion> } | { ok: false, invalid: string };

export function parseAtcExpand(values: string[]): ParsedExpand {
  const expansions = new Set<AtcExpansion>();
  for (const value of values) {
    for (const part of value.split(',')) {
      const token = part.trim().toLowerCase();
      if (token === '') {
        continue;
      }
      if (!(ATC_EXPANSIONS as readonly string[]).includes(token)) {
        return { ok: false, invalid: part.trim() };
      }
      expansions.add(token as AtcExpansion);
    }
  }
  return { ok: true, expansions };
}
