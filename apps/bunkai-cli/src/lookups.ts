import type { ApiResponse } from './api';
import type { Session } from './session';
import { CliError } from './errors';
import { invalidSessionMessage } from './session';

export const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export const MSG_TOO_MANY_REQUESTS = 'Too many requests. Wait a moment and try again.';

export interface ProjectRow {
  id: string
  slug: string
  name: string
}

// BK-1900 PO-7: a PAT revoked or expired before OR during the command gets the same answer.
export function assertReadable(response: ApiResponse, session: Session, forbidden: string): void {
  if (response.status === 401) {
    throw new CliError(invalidSessionMessage(session.source));
  }
  if (response.status === 403) {
    throw new CliError(forbidden);
  }
  if (response.status === 429) {
    throw new CliError(MSG_TOO_MANY_REQUESTS);
  }
}

export async function resolveProject(session: Session, arg: string, forbidden: string): Promise<ProjectRow> {
  const workspace = session.workspace;
  if (!workspace) {
    throw new CliError('You have no Workspace yet: create or join one in the web app, then run "bunkai auth login" again.');
  }
  const byId = UUID.test(arg);
  const response = await session.api.request(`/api/v1/workspaces/${workspace.id}/projects`, {
    token: session.token,
    query: byId ? {} : { slug: arg.toLowerCase() },
  });
  assertReadable(response, session, forbidden);
  const projects = (response.body as { projects?: ProjectRow[] } | null)?.projects;
  if (response.status !== 200 || !Array.isArray(projects)) {
    throw new CliError(`The Projects of ${workspace.name} could not be read (${response.status}).`);
  }
  const found = byId ? projects.find(p => p.id.toLowerCase() === arg.toLowerCase()) : projects.find(p => p.slug === arg.toLowerCase());
  // BK-1900 PO-9: one answer for a Project of another Workspace and for one
  // that does not exist; the message depends only on what was typed.
  if (!found) {
    throw new CliError(`Project not found: "${arg}". Use the slug from the Project's web address, in your default Workspace ${workspace.name} (${workspace.slug}).`);
  }
  return found;
}
