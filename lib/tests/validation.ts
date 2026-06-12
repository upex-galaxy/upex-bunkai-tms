import { z } from 'zod';

// BK-27 — Test create request validation. The Zod layer mirrors the
// `bunkai_create_test` RPC rulebook (trim-then-validate title, chain >= 1) so
// malformed bodies fail fast as a 422 before any DB round-trip; the RPC stays
// the enforcement point of record.

export const TEST_TITLE_MAX = 200;

// UI-only soft cap — the server imposes no chain-length limit (Decision 9).
export const TEST_CHAIN_UI_SOFT_CAP = 100;

export const TestCreateBodySchema = z.object({
  title: z.string().trim().min(1).max(TEST_TITLE_MAX),
  // Duplicates are legal — a chain is a sequence, not a set.
  atc_ids: z.array(z.string().uuid()).min(1),
  // Session callers resolve the active workspace from the cookie; PAT callers
  // must send it explicitly.
  workspace_id: z.string().uuid().optional(),
});
