// Framework-agnostic module-mutation validation helpers. No React/Next/Bun/
// Supabase imports — safe to import from server routes, client components, and
// unit tests alike. Centralises the PATCH body-shape rule (BK-57) and the
// create-toast sequence (BK-67) so both are unit-testable without a DB or DOM.

// Granular failure reasons for the PATCH /modules/{id} body shape, in the
// hybrid-error `details.reason` vocabulary shared with the module routes.
export type ModulePatchShapeError = 'no_fields' | 'combined_update_and_move';

// Presence flags for the PATCH body. Presence — not truthiness — is what the
// caller computes (`'description' in body` semantics): `description: null` is a
// meaningful "clear it" instruction and still counts as present.
export interface ModulePatchShape {
  hasName: boolean
  hasDescription: boolean
  hasParent: boolean
}

export interface ModuleCreateToast {
  kind: 'success' | 'warning'
  message: string
}

// Validate the field combination of a PATCH /modules/{id} body (BK-57).
// An empty body is `no_fields`; mixing a rename/description edit with a move
// (`parent_module_id`) in one request is `combined_update_and_move` — the two
// run as separate rpc() calls, so a combined request could half-apply. Returns
// null when the shape is acceptable.
export function modulePatchShapeError(input: ModulePatchShape): ModulePatchShapeError | null {
  const { hasName, hasDescription, hasParent } = input;
  if (!hasName && !hasDescription && !hasParent) {
    return 'no_fields';
  }
  if ((hasName || hasDescription) && hasParent) {
    return 'combined_update_and_move';
  }
  return null;
}

// Toast sequence after a 201 module create (BK-67). The success toast ALWAYS
// fires first — a deep-nesting `warning` (depth >= 5) is additive, never a
// replacement. A missing/empty warning yields the success toast alone.
export function moduleCreateToasts(warning?: string | null): ModuleCreateToast[] {
  const toasts: ModuleCreateToast[] = [{ kind: 'success', message: 'Module created' }];
  if (typeof warning === 'string' && warning.length > 0) {
    toasts.push({ kind: 'warning', message: warning });
  }
  return toasts;
}
