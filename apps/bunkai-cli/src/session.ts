import type { SavedWorkspace } from './credentials';
import type { Deps } from './deps';
import { ApiClient, DEFAULT_API_URL, normalizeApiUrl } from './api';
import { readSignIn } from './credentials';
import { CliError, MSG_NOT_SIGNED_IN, MSG_SIGN_IN_INVALID, MSG_TOKEN_INVALID } from './errors';

// Which PAT a command uses, and against which Bunkai and default Workspace
// (BK-1900 PO-1, AC-03). BUNKAI_TOKEN wins over the saved sign-in, so a CI job
// never needs a file; its default Workspace is read from /me on every run.

export interface Session {
  api: ApiClient
  token: string
  workspace: SavedWorkspace | null
  source: 'env' | 'saved'
}

interface MeBody {
  workspaces?: Array<{ id: string, slug: string, name: string }>
  active_workspace_id?: string | null
}

function originOf(raw: string): string | null {
  try {
    return new URL(raw).origin;
  }
  catch {
    return null;
  }
}

export function invalidSessionMessage(source: Session['source']): string {
  return source === 'env' ? MSG_TOKEN_INVALID : MSG_SIGN_IN_INVALID;
}

export async function resolveSession(deps: Deps): Promise<Session> {
  const envToken = deps.env.BUNKAI_TOKEN?.trim();
  if (envToken) {
    const api = new ApiClient(normalizeApiUrl(deps.env.BUNKAI_API_URL ?? DEFAULT_API_URL), deps.fetch);
    const me = await api.request('/api/v1/me', { token: envToken });
    if (me.status === 401) {
      throw new CliError(MSG_TOKEN_INVALID);
    }
    const body = me.body as MeBody | null;
    if (me.status !== 200 || !body) {
      throw new CliError(`Your Workspaces could not be read with BUNKAI_TOKEN (${me.status}).`);
    }
    const active = body.workspaces?.find(w => w.id === body.active_workspace_id) ?? null;
    return { api, token: envToken, workspace: active ? { id: active.id, slug: active.slug, name: active.name } : null, source: 'env' };
  }

  const read = await readSignIn(deps.credentialsPath);
  if (read.kind === 'missing') {
    throw new CliError(MSG_NOT_SIGNED_IN);
  }
  if (read.kind === 'invalid') {
    throw new CliError(`The saved sign-in at ${deps.credentialsPath} cannot be read. Run "bunkai auth login" to sign in again.`);
  }
  if (read.tooOpen) {
    deps.stderr.write(`Warning: ${deps.credentialsPath} can be read by other users. Run "chmod 600 ${deps.credentialsPath}" or sign in again.\n`);
  }
  const { signIn } = read;
  if (signIn.token_expires_at && Date.parse(signIn.token_expires_at) <= deps.now().getTime()) {
    throw new CliError(MSG_SIGN_IN_INVALID);
  }
  const apiUrl = normalizeApiUrl(deps.env.BUNKAI_API_URL ?? signIn.api_url);
  // TL-7 lets BUNKAI_API_URL win over the saved URL, so the override is kept,
  // but the saved PAT then travels to a Bunkai it was not minted for: say so.
  if (deps.env.BUNKAI_API_URL !== undefined && new URL(apiUrl).origin !== originOf(signIn.api_url)) {
    deps.stderr.write(`Warning: BUNKAI_API_URL (${apiUrl}) is not the Bunkai you signed in to (${signIn.api_url}); your saved PAT is being sent there.\n`);
  }
  const api = new ApiClient(apiUrl, deps.fetch);
  return { api, token: signIn.token, workspace: signIn.workspace, source: 'saved' };
}
