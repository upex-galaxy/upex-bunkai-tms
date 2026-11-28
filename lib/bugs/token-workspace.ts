import type { Principal } from '@lib/api/principal';
import { ApiError } from '@lib/api/error-envelope';
import { throwBugNotFound } from '@lib/bugs/errors';

// BK-2708: a token scoped to one workspace writes only Bugs of that workspace, checked after
// the Bug is known to be visible to the caller so a hidden Bug keeps the same 404 as before.
export async function assertBugTokenWorkspace(
  principal: Pick<Principal, 'via' | 'workspaceId' | 'db'>,
  bugId: string,
): Promise<void> {
  if (principal.via !== 'bearer' || principal.workspaceId === null) {
    return;
  }
  const { data, error } = await principal.db.from('bugs').select('workspace_id').eq('id', bugId).maybeSingle();
  if (error) {
    throw new ApiError('internal_error', 'Failed to resolve the Bug.');
  }
  if (!data) {
    throwBugNotFound();
  }
  if (data.workspace_id.toLowerCase() !== principal.workspaceId.toLowerCase()) {
    throw new ApiError('forbidden', 'This token is scoped to a different workspace.', {
      details: { reason: 'token_workspace_mismatch' },
    });
  }
}
