import { z } from 'zod';
import { TEST_TAG_MAX_LEN, TEST_TAGS_MAX_COUNT } from './validation';

export const TEST_BULK_CEILING = 200;
export const TEST_BULK_RAW_ID_LIMIT = 1000;

export const TEST_BULK_TAG_MODES = ['add', 'remove'] as const;
export type TestBulkTagMode = (typeof TEST_BULK_TAG_MODES)[number];

export const TEST_BULK_REFUSAL_REASONS = ['not_found', 'archived', 'tags_limit_exceeded', 'write_failed'] as const;
export type TestBulkRefusalReason = (typeof TEST_BULK_REFUSAL_REASONS)[number];

export interface TestBulkOutcome {
  test_id: string
  outcome: 'changed' | 'unchanged' | 'refused'
  reason: TestBulkRefusalReason | null
  tags: string[] | null
  version: number | null
}

export interface TestBulkEditReport {
  dry_run: boolean
  mode: TestBulkTagMode
  requested: number
  changed: number
  unchanged: number
  refused: number
  outcomes: TestBulkOutcome[]
}

// Characters, not UTF-16 units, so the count matches `char_length` in the RPC.
function codePointLength(value: string): number {
  return [...value].length;
}

const BulkTagSchema = z
  .string()
  .trim()
  .min(1, { message: 'A tag cannot be blank.' })
  .refine(tag => codePointLength(tag) <= TEST_TAG_MAX_LEN, { message: `A tag can be at most ${TEST_TAG_MAX_LEN} characters.` })
  .refine(tag => !tag.includes(','), { message: 'Tags must not contain commas.' });

export const TestBulkEditBodySchema = z.strictObject({
  test_ids: z
    .array(z.string())
    .min(1)
    .max(TEST_BULK_RAW_ID_LIMIT)
    .refine(ids => new Set(ids.map(id => id.toLowerCase())).size <= TEST_BULK_CEILING, {
      message: `At most ${TEST_BULK_CEILING} distinct Tests per request.`,
    }),
  mode: z.enum(TEST_BULK_TAG_MODES),
  tags: z.array(BulkTagSchema).min(1).max(TEST_TAGS_MAX_COUNT),
  dry_run: z.boolean().optional().default(false),
  workspace_id: z.string().uuid().optional(),
});

export type TestBulkEditBody = z.infer<typeof TestBulkEditBodySchema>;

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// Runs on the raw body so a non-UUID Test id is a 400 whatever else is wrong.
export function hasNonUuidId(body: unknown): boolean {
  const ids = (body as { test_ids?: unknown } | null)?.test_ids;
  return Array.isArray(ids) && ids.some(id => typeof id === 'string' && !UUID.test(id));
}

export type BulkWorkspaceChoice
  = | { kind: 'workspace', workspaceId: string }
    | { kind: 'active_cookie' }
    | { kind: 'token_workspace_mismatch' }
    | { kind: 'workspace_required' };

export function pickBulkEditWorkspace(
  bodyWorkspaceId: string | undefined,
  principal: { via: 'cookie' | 'bearer', workspaceId: string | null },
): BulkWorkspaceChoice {
  if (principal.via === 'bearer') {
    if (principal.workspaceId !== null && bodyWorkspaceId !== undefined && bodyWorkspaceId.toLowerCase() !== principal.workspaceId.toLowerCase()) {
      return { kind: 'token_workspace_mismatch' };
    }
    const workspaceId = bodyWorkspaceId ?? principal.workspaceId;
    return workspaceId === null ? { kind: 'workspace_required' } : { kind: 'workspace', workspaceId };
  }
  return bodyWorkspaceId === undefined ? { kind: 'active_cookie' } : { kind: 'workspace', workspaceId: bodyWorkspaceId };
}
