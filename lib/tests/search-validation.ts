import { z } from 'zod';

// BK-203 — query-string validation for GET /api/v1/tests/search. Sibling of
// `lib/atcs/search-validation.ts` (BK-20): same shape, new domain — the Tests
// domain had no search endpoint before this story.
//
//   query      required, trimmed, ≥1 char after trim (empty performs NO
//              search — mirrors AtcSearchQuerySchema).
//   project_id required UUID — scopes the search to a single project. A Test
//              carries no project_id column (Tests are workspace-scoped); the
//              RPC derives "this Test's project" via its chained ATCs
//              (test_steps -> atcs -> projects), same derivation
//              bunkai_start_run already uses.
//   limit      1..50, default 20.

export const TEST_SEARCH_LIMIT_DEFAULT = 20;
export const TEST_SEARCH_LIMIT_MAX = 50;

export const TestSearchQuerySchema = z.object({
  query: z.string().trim().min(1),
  project_id: z.string().uuid(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(TEST_SEARCH_LIMIT_MAX)
    .default(TEST_SEARCH_LIMIT_DEFAULT),
});

export type TestSearchQuery = z.infer<typeof TestSearchQuerySchema>;

export function parseTestSearchParams(params: URLSearchParams): TestSearchQuery {
  const raw: Record<string, string> = {};
  for (const key of ['query', 'project_id', 'limit'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return TestSearchQuerySchema.parse(raw);
}
