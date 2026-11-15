import type { Deps } from './deps';
import { authLogin, LOGIN_USAGE } from './commands/auth-login';
import { CliError, EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from './errors';

// The whole CLI as one function: argv in, exit code out, every effect through
// `deps`. `src/index.ts` wires the real process; tests wire fakes.

export const USAGE = `Usage: bunkai <command> [options]

Commands:
  auth login    Sign in with your email and password.

Run "bunkai <command> --help" for a command's options.

Environment:
  BUNKAI_TOKEN       Use this PAT instead of the saved sign-in (CI, scripts).
  BUNKAI_API_URL     Bunkai to talk to instead of the saved or default one.
  BUNKAI_CONFIG_DIR  Folder for the saved sign-in.
`;

type Command = (argv: string[], deps: Deps) => Promise<number>;

const COMMANDS: Record<string, { run: Command, usage: string }> = {
  'auth login': { run: authLogin, usage: LOGIN_USAGE },
};

export async function run(argv: string[], deps: Deps): Promise<number> {
  const [group, name, ...rest] = argv;
  if (group === undefined || group === '-h' || group === '--help' || group === 'help') {
    (group === undefined ? deps.stderr : deps.stdout).write(USAGE);
    return group === undefined ? EXIT_USAGE : EXIT_OK;
  }
  const command = COMMANDS[`${group} ${name ?? ''}`];
  if (!command) {
    deps.stderr.write(`Unknown command "${[group, name].filter(Boolean).join(' ')}".\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  try {
    return await command.run(rest, deps);
  }
  catch (err) {
    if (err instanceof CliError) {
      deps.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }
    // Never a stack trace: one line a person can act on or quote.
    deps.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT_FAILURE;
  }
}
