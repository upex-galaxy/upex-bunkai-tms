import { z } from 'zod';
import { countCodePoints, hasUnstorableCharacter, SAVED_VIEW_NAME_MAX, VIEW_KINDS } from './constants';

// BK-443 — request validation for the saved-views routes. Mirrors the rules
// migration 0093 enforces (the database stays the authority): trimmed name of
// 1..80 code points with no control characters. The per-surface state shape is
// NOT checked here because PATCH does not carry the surface; the route checks
// the state with `validateStateForKind` once it knows the kind.
//
// Each refusal carries a machine `reason` in `params`, which `errors.ts` maps
// into the envelope's `details.reason`.

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

export const ViewKindSchema = z.enum(VIEW_KINDS, {
  error: 'view_kind must be one of traceability, run_history, bugs, workbench.',
});

// NFC first, then `String#trim` (all Unicode whitespace), both before the
// checks: what is stored is what is compared, the `name = btrim(name)` CHECK
// always holds, and the NFC and NFD spellings of one name ("é" as one code
// point or as "e" plus a combining accent) collide on the unique key instead of
// coexisting. SQL does not normalise, so a direct PostgREST write is not
// covered by this; the API is the supported path (see migration 0093's header).
export const SavedViewNameSchema = z
  .string()
  .transform(value => value.normalize('NFC').trim())
  .superRefine((value, ctx) => {
    if (hasControlCharacter(value) || hasUnstorableCharacter(value)) {
      ctx.addIssue({ code: 'custom', message: 'Name cannot contain control characters or unpaired surrogates.', params: { reason: 'name_invalid' } });
      return;
    }
    const length = countCodePoints(value);
    if (length < 1 || length > SAVED_VIEW_NAME_MAX) {
      ctx.addIssue({ code: 'custom', message: `Name must be between 1 and ${SAVED_VIEW_NAME_MAX} characters.`, params: { reason: 'name_length' } });
    }
  });

const StateInputSchema = z.record(z.string(), z.string(), { error: 'state must be an object of text values.' });

export const SavedViewCreateBodySchema = z.strictObject({
  view_kind: ViewKindSchema,
  name: SavedViewNameSchema,
  state: StateInputSchema,
});

export const SavedViewPatchBodySchema = z
  .strictObject({
    name: SavedViewNameSchema.optional(),
    state: StateInputSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.name === undefined && value.state === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Send a name, a state, or both.', params: { reason: 'body_empty' } });
    }
  });

export const SavedViewListQuerySchema = z.object({ view_kind: ViewKindSchema });

export type SavedViewCreateBody = z.infer<typeof SavedViewCreateBodySchema>;
export type SavedViewPatchBody = z.infer<typeof SavedViewPatchBodySchema>;
