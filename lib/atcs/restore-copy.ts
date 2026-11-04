// BK-571 — the words around restoring an ATC. Pure, unit-tested in
// `restore-copy.test.ts`.

export const RESTORE_FAILURE_COPY = 'Could not restore this ATC. Nothing changed.';

type Parent = 'module' | 'user_story' | null;

export function parentLabel(parent: 'module' | 'user_story'): string {
  return parent === 'module' ? 'Module' : 'User Story';
}

// Restored for real: "Restored "x"."  Restored but its parent is still archived
// (the server hands the ATC to the parent's cascade): it says where it went.
export function restoreToastMessage(title: string, heldByParent: Parent): string {
  const base = `Restored "${title}".`;
  return heldByParent === null
    ? base
    : `${base} It stays out of the library until its ${parentLabel(heldByParent)} is restored.`;
}
