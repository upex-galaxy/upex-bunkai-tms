import type { SavedSignIn, SavedWorkspace } from '../credentials';
import type { Deps } from '../deps';
import { parseArgs } from 'node:util';
import { ApiClient, DEFAULT_API_URL, errorOf, normalizeApiUrl } from '../api';
import { CREDENTIALS_VERSION, writeSignIn } from '../credentials';
import { CliError, EXIT_CANCELLED, EXIT_OK, PromptCancelled, usageError } from '../errors';

// `bunkai auth login` (BK-1900 AC-01). Email + password once; the password is
// sent to the headless sign-in and dropped. What is kept is a read-only PAT
// that expires in 90 days and the default Workspace (TL-3, TL-4). The file is
// written only after the sign-in AND the Workspace lookup both succeed, so a
// wrong password, a network failure or Ctrl+C leaves nothing behind.

export const LOGIN_USAGE = `Usage: bunkai auth login [--email <email>] [--api-url <url>]

Sign in with your Bunkai email and password. The password is typed at a hidden
prompt and never stored: the CLI keeps a read-only PAT (90 days) and your
default Workspace, in a file only your user can read.

Options:
  --email <email>    Skip the email prompt.
  --api-url <url>    Bunkai to sign in to (default ${DEFAULT_API_URL}, or BUNKAI_API_URL).
  -h, --help         Show this help.

In CI or a script, do not sign in: set BUNKAI_TOKEN to a PAT created in Settings.
`;

export const PAT_SCOPES = ['atc:read'] as const;
export const PAT_EXPIRES_IN_DAYS = 90;
const PAT_NAME_MAX = 80;

// PO-4 (amended AC-01 scenario 4): the sign-in answers one uniform refusal, so
// this one message covers a wrong password AND an account with no password.
export const MSG_WRONG_CREDENTIALS = 'The email or password is not right. This sign-in needs a password: an account that only signs in with a magic link, GitHub or Google has none, so sign in to the web app instead.';
export const MSG_THROTTLED = 'Too many sign-in attempts. Wait a few minutes and try again.';
export const MSG_CANCELLED = 'Sign-in cancelled. Nothing was saved.';

// The sign-in already created the PAT when a later step fails, and a PAT
// cannot revoke itself (TL-3), so the person is told it exists.
export function leftoverPat(tokenName: string): string {
  return `The PAT "${tokenName}" this sign-in created stays active until you revoke it in Settings or it expires.`;
}

export function patName(hostname: string): string {
  const host = hostname.trim().replace(/[^\w.-]/g, '') || 'unknown-host';
  return `bunkai-cli ${host}`.slice(0, PAT_NAME_MAX);
}

interface SignInBody {
  user?: { email?: string | null }
  pat?: { token?: string, id?: string, expires_at?: string | null }
}

interface MeBody {
  workspaces?: Array<{ id: string, slug: string, name: string }>
  active_workspace_id?: string | null
}

export async function authLogin(argv: string[], deps: Deps): Promise<number> {
  let values: { 'email'?: string, 'api-url'?: string, 'help'?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        'email': { type: 'string' },
        'api-url': { type: 'string' },
        'help': { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }));
  }
  catch (err) {
    throw usageError(`${(err as Error).message}\n\n${LOGIN_USAGE}`);
  }
  if (values.help) {
    deps.stdout.write(LOGIN_USAGE);
    return EXIT_OK;
  }

  const apiUrl = normalizeApiUrl(values['api-url'] ?? deps.env.BUNKAI_API_URL ?? DEFAULT_API_URL);
  const api = new ApiClient(apiUrl, deps.fetch);

  let email: string;
  let password: string;
  try {
    email = (values.email ?? await deps.prompt.text('Email: ')).trim();
    if (email.length === 0) {
      throw usageError('An email is required.');
    }
    password = await deps.prompt.secret('Password: ');
  }
  catch (err) {
    if (err instanceof PromptCancelled) {
      throw new CliError(MSG_CANCELLED, EXIT_CANCELLED);
    }
    throw err;
  }
  if (password.length === 0) {
    throw new CliError('A password is required.');
  }

  const tokenName = patName(deps.hostname());
  const signIn = await api.request('/api/v1/auth/signin', {
    method: 'POST',
    body: {
      email,
      password,
      pat_name: tokenName,
      pat_scopes: [...PAT_SCOPES],
      pat_expires_in_days: PAT_EXPIRES_IN_DAYS,
    },
  });
  // From here on nothing needs the password.
  password = '';

  if (signIn.status === 401) {
    throw new CliError(MSG_WRONG_CREDENTIALS);
  }
  if (signIn.status === 429) {
    throw new CliError(MSG_THROTTLED);
  }
  if (signIn.status === 422) {
    const issues = errorOf(signIn).details;
    const emailIssue = Array.isArray(issues) && issues.some(i => Array.isArray(i?.path) && i.path[0] === 'email');
    // A password outside the accepted length can never be right, so it gets
    // the same answer as a wrong one.
    throw new CliError(emailIssue ? `"${email}" is not a valid email address.` : MSG_WRONG_CREDENTIALS);
  }
  const signInBody = signIn.body as SignInBody | null;
  const pat = signInBody?.pat;
  if (signIn.status !== 200 || !pat?.token || !pat.id) {
    throw new CliError(`The sign-in failed: ${errorOf(signIn).message ?? `unexpected answer (${signIn.status})`}. Nothing was saved.`);
  }

  const me = await api.request('/api/v1/me', { token: pat.token });
  const meBody = me.body as MeBody | null;
  if (me.status !== 200 || !meBody) {
    throw new CliError(`Signed in, but your Workspaces could not be read (${me.status}). Nothing was saved; run "bunkai auth login" again. ${leftoverPat(tokenName)}`);
  }
  const active = meBody.workspaces?.find(w => w.id === meBody.active_workspace_id) ?? null;
  const workspace: SavedWorkspace | null = active ? { id: active.id, slug: active.slug, name: active.name } : null;

  const saved: SavedSignIn = {
    version: CREDENTIALS_VERSION,
    api_url: apiUrl,
    email: signInBody?.user?.email ?? email,
    token: pat.token,
    token_id: pat.id,
    token_expires_at: pat.expires_at ?? null,
    workspace,
    signed_in_at: deps.now().toISOString(),
  };
  try {
    await writeSignIn(deps.credentialsPath, saved);
  }
  catch (err) {
    throw new CliError(`Signed in, but the sign-in could not be saved to ${deps.credentialsPath}: ${(err as Error).message}. ${leftoverPat(tokenName)}`);
  }

  deps.stderr.write(`Signed in as ${saved.email}.\n`);
  deps.stderr.write(workspace
    ? `Default Workspace: ${workspace.name} (${workspace.slug}).\n`
    : 'You have no Workspace yet: create or join one in the web app before searching ATCs.\n');
  deps.stderr.write(`Sign-in saved to ${deps.credentialsPath} (readable only by you).\n`);
  return EXIT_OK;
}
