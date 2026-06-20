import { z } from 'zod';

// BK-148 — Project Environment name validation. The Zod layer mirrors the
// `bunkai_create_environment` / `bunkai_rename_environment` RPC rulebook (trim,
// non-empty, length 1..50) so malformed bodies fail fast as a 422 before any DB
// round-trip; the RPC stays the enforcement point of record (it re-applies
// btrim + the 1..50 guard, and the unique (project_id, lower(name)) index is the
// authoritative case-insensitive-uniqueness check).
//
// Length contract: the app enforces the AC rule of 1..50; the table CHECK is the
// wider 1..60 (migration 0031), a harmless outer bound — see implementation-plan
// §0 + ADR-0004.

export const ENVIRONMENT_NAME_MAX = 50;

// `.trim()` normalizes surrounding whitespace BEFORE the min/max checks, so
// '  Staging  ' validates (and persists) as 'Staging' and '   ' fails min(1).
export const EnvironmentNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(ENVIRONMENT_NAME_MAX, `Name must be ${ENVIRONMENT_NAME_MAX} characters or fewer`);

export const EnvironmentCreateBodySchema = z.object({
  name: EnvironmentNameSchema,
});

export const EnvironmentRenameBodySchema = z.object({
  name: EnvironmentNameSchema,
});

export type EnvironmentCreateBody = z.infer<typeof EnvironmentCreateBodySchema>;
export type EnvironmentRenameBody = z.infer<typeof EnvironmentRenameBodySchema>;
