import type { ApiResponse, TransportFailure } from '../api';
import type { Deps } from '../deps';
import type { ProjectRow } from '../lookups';
import type { Session } from '../session';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { errorOf } from '../api';
import { CliError, EXIT_OK, usageError } from '../errors';
import { assertReadable, MSG_TOO_MANY_REQUESTS, resolveProject, UUID } from '../lookups';
import { invalidSessionMessage, resolveSession } from '../session';
import { printable } from '../table';

export const RUN_START_USAGE_LINE = 'Usage: bunkai run start --project <slug|id> --test <id> --env <name> [options]';

export const EXECUTORS = ['human', 'agent', 'ci'] as const;
export type Executor = typeof EXECUTORS[number];
export const RETRY_KEY_MAX = 200;
export const IDLE_CLOSE_MINUTES = 60;

export const RUN_START_USAGE = `${RUN_START_USAGE_LINE}

Start a manual Run of a Test in one of its Project's environments, in your
default Workspace, and print the new Run.

Options:
  --project <slug|id>   The Project, by the slug in its web address or by its id.
  --test <id>           The Test to run, by its id.
  --env <name>          The environment, by name (letter case and surrounding
                        spaces are ignored).
  --executor <who>      human (default), agent or ci. An agent or ci Run with no
                        step result for ${IDLE_CLOSE_MINUTES} minutes is closed automatically.
  --retry-key <key>     1 to ${RETRY_KEY_MAX} characters. Repeating the command with the same key
                        within 24 hours returns the same Run instead of starting
                        a second one. Without it, every start is a new Run.
  --json                Print only one JSON object describing the Run on stdout.
  -h, --help            Show this help.

Example:
  bunkai run start --project checkout-v2 --test 3f2b6c1e-8d4a-4f6e-9b1a-2c7d5e8f0a13 \\
    --env Staging --executor agent --retry-key nightly-2026-11-17 --json

Exit codes:
  0  A Run was started, or the retry key returned the Run it started before.
  1  The Run could not be started, or the outcome is unknown (the message gives
     the --retry-key to repeat safely).
  2  The command line is wrong.
`;

interface Options {
  project: string
  test: string
  env: string
  executor: Executor
  retryKey: string | null
  json: boolean
}

interface EnvironmentRow {
  id: string
  name: string
}

interface RunBody {
  id: string
  status: string
  replayed?: boolean
  test_id?: string
  test_title?: string
  project_id?: string
  environment_id: string
  environment_name?: string | null
  executor_mode: string
  started_at?: string
}

export interface RunSummary {
  id: string
  url: string
  status: string
  replayed: boolean
  test_id: string
  test_title: string
  project_id: string
  environment_id: string
  environment_name: string
  executor_mode: string
  started_at: string
}

function usage(message: string): CliError {
  return usageError(`${message}\n${RUN_START_USAGE_LINE}\nRun "bunkai run start --help" for every option.`);
}

function parseOptions(argv: string[]): Options | 'help' {
  let values: { 'project'?: string, 'test'?: string, 'env'?: string, 'executor'?: string, 'retry-key'?: string, 'json'?: boolean, 'help'?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        'project': { type: 'string' },
        'test': { type: 'string' },
        'env': { type: 'string' },
        'executor': { type: 'string' },
        'retry-key': { type: 'string' },
        'json': { type: 'boolean' },
        'help': { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }));
  }
  catch (err) {
    throw usage((err as Error).message);
  }
  if (values.help) {
    return 'help';
  }
  const project = values.project?.trim() ?? '';
  if (project.length === 0) {
    throw usage('A Project is required: --project <slug|id>.');
  }
  const test = values.test?.trim() ?? '';
  if (test.length === 0) {
    throw usage('A Test is required: --test <id>.');
  }
  if (!UUID.test(test)) {
    throw usage(`--test must be the id of a Test (a UUID such as 3f2b6c1e-8d4a-4f6e-9b1a-2c7d5e8f0a13), not "${printable(test)}".`);
  }
  const env = values.env?.trim() ?? '';
  if (env.length === 0) {
    throw usage('An environment is required: --env <name>.');
  }
  const executor = values.executor?.trim() ?? 'human';
  if (!(EXECUTORS as readonly string[]).includes(executor)) {
    throw usage(`--executor must be human, agent or ci, not "${printable(executor)}".`);
  }
  let retryKey: string | null = null;
  if (values['retry-key'] !== undefined) {
    retryKey = values['retry-key'].trim();
    if (retryKey.length === 0) {
      throw usage('--retry-key cannot be blank.');
    }
    if (retryKey.length > RETRY_KEY_MAX) {
      throw usage(`--retry-key can be at most ${RETRY_KEY_MAX} characters (this one has ${retryKey.length}).`);
    }
  }
  return { project, test: test.toLowerCase(), env, executor: executor as Executor, retryKey, json: values.json === true };
}

function capabilityRefusal(session: Session): string {
  return session.source === 'env'
    ? 'The PAT in BUNKAI_TOKEN cannot start Runs: it needs both the atc:read and run:execute scopes. Create one with both in Settings.'
    : 'This sign-in cannot start Runs: it was made before "bunkai run start" existed and its PAT lacks run:execute. Run "bunkai auth login" to sign in again ("bunkai atc list" keeps working meanwhile).';
}

export function matchEnvironment(environments: EnvironmentRow[], project: ProjectRow, arg: string): EnvironmentRow {
  if (environments.length === 0) {
    throw new CliError(`The Project ${printable(project.name)} has no environments yet. Add one in the web app (the Project's settings), then run this again.`);
  }
  const wanted = arg.trim().toLowerCase();
  const found = environments.find(e => e.name.trim().toLowerCase() === wanted);
  if (!found) {
    const names = environments.map(e => `  ${printable(e.name)}`).join('\n');
    throw new CliError(`Unknown environment "${printable(arg)}" in ${printable(project.name)}. Its environments are:\n${names}`);
  }
  return found;
}

async function resolveEnvironment(session: Session, project: ProjectRow, arg: string): Promise<EnvironmentRow> {
  const response = await session.api.request(`/api/v1/projects/${project.id}/environments`, { token: session.token });
  assertReadable(response, session, capabilityRefusal(session));
  const environments = (response.body as { environments?: EnvironmentRow[] } | null)?.environments;
  if (response.status !== 200 || !Array.isArray(environments)) {
    throw new CliError(`The environments of ${printable(project.name)} could not be read (${response.status}).`);
  }
  return matchEnvironment(environments, project, arg);
}

function reasonOf(response: ApiResponse): string | undefined {
  const details = errorOf(response).details as { reason?: unknown } | undefined;
  return details && typeof details === 'object' && typeof details.reason === 'string' ? details.reason : undefined;
}

// TL-1: the start answers one 403 for a missing Test, a hidden Test and a read-only role.
async function assertTestExists(session: Session, testId: string): Promise<void> {
  const response = await session.api.request(`/api/v1/tests/${testId}`, { token: session.token });
  if (response.status === 404 || (response.status === 403 && reasonOf(response) !== 'missing_capability')) {
    throw new CliError(`Test not found: ${testId}. Check the id in the Test's web address.`);
  }
  assertReadable(response, session, capabilityRefusal(session));
  if (response.status !== 200) {
    throw new CliError(`The Test could not be read (${response.status}).`);
  }
}

export function shellQuote(value: string): string {
  return /^[\w.:@%+=,/-]+$/.test(value) ? value : `'${value.replace(/'/g, '\'\\\'\'')}'`;
}

function unknownOutcome(startToken: string, why: string): CliError {
  return new CliError(`The start request got no clear answer (${why}), so the Run may or may not have started. Nothing was retried. Repeat the command with --retry-key=${shellQuote(startToken)} to get that Run if it exists, without starting a second one.`);
}

function transportWhy(failure: TransportFailure): string {
  if (failure.kind === 'timeout') {
    return `no answer came within ${failure.seconds} s`;
  }
  if (failure.kind === 'unreachable') {
    return 'the connection failed';
  }
  return `Bunkai answered with a server error (${failure.status}${failure.requestId ? `, request id ${failure.requestId}` : ''})`;
}

function refusal(response: ApiResponse, session: Session, project: ProjectRow): CliError {
  const reason = reasonOf(response);
  const message = errorOf(response).message;
  switch (response.status) {
    case 401:
      return new CliError(invalidSessionMessage(session.source));
    case 403:
      return new CliError(reason === 'missing_capability'
        ? capabilityRefusal(session)
        : 'You are not allowed to start Runs here: starting a Run needs write access in the Test\'s Workspace, and your role there is read-only.');
    case 409:
      if (reason === 'test_archived') {
        return new CliError('This Test is archived. Restore it in the web app before starting a Run.');
      }
      return new CliError(`The Run could not be started: ${message ?? 'conflict (409)'}`);
    case 422:
      if (reason === 'environment_invalid') {
        return new CliError(`The Test does not belong to the Project ${printable(project.name)}. Check --project and --test.`);
      }
      if (reason === 'no_executable_steps') {
        return new CliError('The Test has nothing to run: add at least one ATC step to it in the web app.');
      }
      return new CliError(`The Run could not be started: ${message ?? 'the request was refused (422)'}`);
    case 429:
      return new CliError(MSG_TOO_MANY_REQUESTS);
    default:
      return new CliError(`The Run could not be started: ${message ?? `unexpected answer (${response.status})`}.`);
  }
}

function readRun(response: ApiResponse): RunBody | null {
  const run = (response.body as { run?: Partial<RunBody> } | null)?.run;
  if (!run || typeof run !== 'object') {
    return null;
  }
  return typeof run.id === 'string' && typeof run.status === 'string' && typeof run.environment_id === 'string' && typeof run.executor_mode === 'string'
    ? run as RunBody
    : null;
}

function summaryLines(summary: RunSummary, workspaceName: string): string {
  const rows: Array<[string, string]> = [
    ['Run', summary.id],
    ['Test', printable(summary.test_title)],
    ['Environment', printable(summary.environment_name)],
    ['Executor', summary.executor_mode],
    ['Status', summary.status],
    ['Workspace', printable(workspaceName)],
    ['Link', summary.url],
  ];
  const head = summary.replayed ? 'Run already existed (same retry key), nothing new was started.' : 'Run started.';
  return `${head}\n${rows.map(([label, value]) => `  ${`${label}:`.padEnd(13)}${value}`).join('\n')}\n`;
}

export async function runStart(argv: string[], deps: Deps): Promise<number> {
  const options = parseOptions(argv);
  if (options === 'help') {
    deps.stdout.write(RUN_START_USAGE);
    return EXIT_OK;
  }

  const session = await resolveSession(deps);
  const project = await resolveProject(session, options.project, capabilityRefusal(session));
  const environment = await resolveEnvironment(session, project, options.env);
  await assertTestExists(session, options.test);

  const startToken = options.retryKey ?? randomUUID();
  const response = await session.api.request('/api/v1/runs', {
    method: 'POST',
    token: session.token,
    headers: { 'idempotency-key': randomUUID() },
    body: { test_id: options.test, environment_id: environment.id, executor_mode: options.executor, start_token: startToken },
    onTransportFailure: failure => unknownOutcome(startToken, transportWhy(failure)),
  });
  if (response.status >= 200 && response.status < 300 && response.status !== 200 && response.status !== 201) {
    throw unknownOutcome(startToken, `an unexpected answer (${response.status})`);
  }
  if (response.status !== 200 && response.status !== 201) {
    throw refusal(response, session, project);
  }
  const run = readRun(response);
  if (!run) {
    throw unknownOutcome(startToken, 'its answer could not be read');
  }

  const url = `${session.api.baseUrl}/projects/${project.slug}/runs/${run.id}`;
  const replayed = run.replayed === true;
  // PO-1: the server matches a retry key on the Test only.
  if (replayed && (run.environment_id !== environment.id || run.executor_mode !== options.executor)) {
    const where = printable(run.environment_name ?? run.environment_id);
    throw new CliError(`The retry key ${shellQuote(startToken)} already belongs to a Run of this Test started in ${where} with executor ${run.executor_mode}: ${url}\nNo Run was started. Use a new --retry-key to start one in ${printable(environment.name)} with executor ${options.executor}.`);
  }

  const summary: RunSummary = {
    id: run.id,
    url,
    status: run.status,
    replayed,
    test_id: run.test_id ?? options.test,
    test_title: run.test_title ?? '',
    project_id: run.project_id ?? project.id,
    environment_id: run.environment_id,
    environment_name: run.environment_name ?? environment.name,
    executor_mode: run.executor_mode,
    started_at: run.started_at ?? '',
  };
  deps.stdout.write(options.json ? `${JSON.stringify(summary, null, 2)}\n` : summaryLines(summary, session.workspace?.name ?? ''));
  if (replayed && run.status !== 'running') {
    deps.stderr.write(`This Run is already ${run.status}. Use a new --retry-key to start another Run.\n`);
  }
  else if (options.executor !== 'human') {
    deps.stderr.write(`${options.executor === 'agent' ? 'An agent' : 'A ci'} Run with no step result for ${IDLE_CLOSE_MINUTES} minutes is closed automatically.\n`);
  }
  return EXIT_OK;
}
