import { z } from 'zod';

// BK-203 — request-body validation for POST /api/v1/test-plans/{id}/tests.
// `test_ids` mirrors the RPC's own defense-in-depth check (45605
// test_selection_empty): at least one uuid, fails fast as 422 before any DB
// round-trip. Duplicate ids inside the array are legal input — the RPC
// dedupes via `select distinct` before resolving/inserting, so a client that
// submits the same id twice is not itself an error.

export const TestPlanAddTestsBodySchema = z.object({
  test_ids: z.array(z.string().uuid()).min(1, 'Select at least one test to add.'),
});

export type TestPlanAddTestsBody = z.infer<typeof TestPlanAddTestsBodySchema>;
