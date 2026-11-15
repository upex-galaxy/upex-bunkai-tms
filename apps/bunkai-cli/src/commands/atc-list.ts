import type { ApiResponse } from '../api';
import type { Deps } from '../deps';
import type { Session } from '../session';
import { parseArgs } from 'node:util';
import { errorOf } from '../api';
import { CliError, EXIT_OK, usageError } from '../errors';
import { invalidSessionMessage, resolveSession } from '../session';
import { renderTable } from '../table';

// `bunkai atc list` (BK-1900 AC-02, AC-03). Finds ATCs in one Project by text,
// optionally narrowed to a Module and its sub-Modules. The Project and the
// Module are looked up FIRST, so "Project not found" / "Module not found"
// (non-zero) never read as "No ATCs found" (zero): the ATC search alone
// answers [] for all three. With --json, stdout carries only the JSON.

export const LIST_USAGE = `Usage: bunkai atc list --project <slug|id> --query <text> [options]

Find ATCs in a Project of your default Workspace, best matches first.

Options:
  --project <slug|id>   The Project, by the slug in its web address or by its id.
  --query <text>        The text to search for (required).
  --module <path|name>  Only this Module and its sub-Modules (a path such as
                        payments/cards, or a Module name).
  --limit <n>           How many ATCs, 1 to 50 (default 20).
  --json                Print only a JSON array of the ATCs on stdout.
  -h, --help            Show this help.
`;

export const LIMIT_DEFAULT = 20;
export const LIMIT_MAX = 50;

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export interface AtcRow {
  id: string
  slug: string
  title: string
  layer: string
  status: string
  module_path: string
}

interface Options {
  project: string
  query: string
  module: string | null
  limit: number
  json: boolean
}

function parseOptions(argv: string[]): Options | 'help' {
  let values: { project?: string, query?: string, module?: string, limit?: string, json?: boolean, help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        project: { type: 'string' },
        query: { type: 'string' },
        module: { type: 'string' },
        limit: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }));
  }
  catch (err) {
    throw usageError(`${(err as Error).message}\n\n${LIST_USAGE}`);
  }
  if (values.help) {
    return 'help';
  }
  const project = values.project?.trim() ?? '';
  if (project.length === 0) {
    throw usageError(`A Project is required: --project <slug|id>.\n\n${LIST_USAGE}`);
  }
  // PO-8: an empty or blank text is refused before anything is sent. It is a
  // usage error, so it exits 2 like a missing --project (TL-6).
  if (values.query === undefined || values.query.trim().length === 0) {
    throw usageError('A search text is required: --query <text>.');
  }
  let limit = LIMIT_DEFAULT;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) {
      throw usageError(`--limit must be a whole number from 1 to ${LIMIT_MAX}.`);
    }
  }
  const moduleArg = values.module?.trim() ?? '';
  return { project, query: values.query.trim(), module: moduleArg.length > 0 ? moduleArg : null, limit, json: values.json === true };
}

// One refusal shape for every authenticated read (PO-7): a PAT revoked or
// expired before OR during the command gets the same answer.
function assertReadable(response: ApiResponse, session: Session): void {
  if (response.status === 401) {
    throw new CliError(invalidSessionMessage(session.source));
  }
  if (response.status === 403) {
    throw new CliError(session.source === 'env'
      ? 'The PAT in BUNKAI_TOKEN cannot read ATCs: it needs the atc:read scope.'
      : 'This sign-in cannot read ATCs (its PAT lacks atc:read). Run "bunkai auth login" to sign in again.');
  }
  if (response.status === 429) {
    throw new CliError('Too many requests. Wait a moment and try again.');
  }
}

async function resolveProject(session: Session, arg: string): Promise<{ id: string, slug: string, name: string }> {
  const workspace = session.workspace;
  if (!workspace) {
    throw new CliError('You have no Workspace yet: create or join one in the web app, then run "bunkai auth login" again.');
  }
  const byId = UUID.test(arg);
  const response = await session.api.request(`/api/v1/workspaces/${workspace.id}/projects`, {
    token: session.token,
    query: byId ? {} : { slug: arg.toLowerCase() },
  });
  assertReadable(response, session);
  const projects = (response.body as { projects?: Array<{ id: string, slug: string, name: string }> } | null)?.projects;
  if (response.status !== 200 || !Array.isArray(projects)) {
    throw new CliError(`The Projects of ${workspace.name} could not be read (${response.status}).`);
  }
  const found = byId ? projects.find(p => p.id.toLowerCase() === arg.toLowerCase()) : projects.find(p => p.slug === arg.toLowerCase());
  // PO-9: one answer for a Project of another Workspace and for one that does
  // not exist; the message depends only on what was typed.
  if (!found) {
    throw new CliError(`Project not found: "${arg}". Use the slug from the Project's web address, in your default Workspace ${workspace.name} (${workspace.slug}).`);
  }
  return found;
}

interface ModuleRow { id: string, path: string, name: string }

export function matchModule(modules: ModuleRow[], arg: string): ModuleRow {
  const wanted = arg.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  const byPath = modules.find(m => m.path.toLowerCase() === wanted);
  if (byPath) {
    return byPath;
  }
  const byName = modules.filter(m => m.name.trim().toLowerCase() === wanted);
  if (byName.length === 1) {
    return byName[0];
  }
  if (byName.length > 1) {
    const paths = byName.map(m => `  ${m.path}`).sort().join('\n');
    throw new CliError(`More than one Module is named "${arg}". Use its path with --module:\n${paths}`);
  }
  throw new CliError(`Module not found: "${arg}".`);
}

async function resolveModule(session: Session, projectId: string, arg: string): Promise<ModuleRow> {
  const response = await session.api.request(`/api/v1/projects/${projectId}/modules`, { token: session.token });
  assertReadable(response, session);
  const modules = (response.body as { modules?: ModuleRow[] } | null)?.modules;
  if (response.status !== 200 || !Array.isArray(modules)) {
    throw new CliError(`The Modules of this Project could not be read (${response.status}).`);
  }
  return matchModule(modules, arg);
}

function toRow(item: Record<string, unknown>): AtcRow {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    id: text(item.id),
    slug: text(item.slug),
    title: text(item.title),
    layer: text(item.layer),
    status: text(item.status),
    module_path: text(item.module_path),
  };
}

export async function atcList(argv: string[], deps: Deps): Promise<number> {
  const options = parseOptions(argv);
  if (options === 'help') {
    deps.stdout.write(LIST_USAGE);
    return EXIT_OK;
  }

  const session = await resolveSession(deps);
  const project = await resolveProject(session, options.project);
  const narrowTo = options.module === null ? null : await resolveModule(session, project.id, options.module);

  const response = await session.api.request('/api/v1/atcs/search', {
    token: session.token,
    query: { query: options.query, project_id: project.id, module_id: narrowTo?.id, limit: options.limit },
  });
  assertReadable(response, session);
  const items = (response.body as { items?: Array<Record<string, unknown>> } | null)?.items;
  if (response.status !== 200 || !Array.isArray(items)) {
    throw new CliError(`The search failed: ${errorOf(response).message ?? `unexpected answer (${response.status})`}.`);
  }
  // PO-3: the server's ranking (relevance weighted by recency) is kept as is.
  const rows = items.map(toRow);

  if (options.json) {
    deps.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  }
  else if (rows.length === 0) {
    deps.stdout.write('No ATCs found.\n');
  }
  else {
    deps.stdout.write(renderTable(['TITLE', 'LAYER', 'MODULE'], rows.map(r => [r.title, r.layer, r.module_path])));
  }
  if (rows.length === options.limit) {
    deps.stderr.write(`Showing the first ${options.limit} matches. Narrow the text, or raise --limit (up to ${LIMIT_MAX}), to see more.\n`);
  }
  return EXIT_OK;
}
