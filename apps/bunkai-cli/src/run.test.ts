import { describe, expect, it } from 'bun:test';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from './errors';
import { run } from './run';
import { fakeDeps } from './testing/fakes';

// BK-1900 scope "usage help for both commands" and "no stack trace, ever".

function deps(fetchImpl: typeof fetch = (async () => new Response('')) as unknown as typeof fetch) {
  return fakeDeps({ fetch: fetchImpl, credentialsPath: '/nonexistent/bunkai/credentials.json' });
}

describe('bunkai (dispatch)', () => {
  it('prints the usage to stderr and exits 2 with no command', async () => {
    const d = deps();
    expect(await run([], d)).toBe(EXIT_USAGE);
    expect(d.stderrText()).toContain('Usage: bunkai <command>');
    expect(d.stdoutText()).toBe('');
  });

  it('prints the usage to stdout and exits 0 on --help', async () => {
    const d = deps();
    expect(await run(['--help'], d)).toBe(EXIT_OK);
    expect(d.stdoutText()).toContain('auth login');
  });

  it('refuses an unknown command as a usage error', async () => {
    const d = deps();
    expect(await run(['atc', 'delete'], d)).toBe(EXIT_USAGE);
    expect(d.stderrText()).toContain('Unknown command "atc delete"');
  });

  it('turns an unexpected failure into one line, never a stack trace', async () => {
    const d = fakeDeps({
      fetch: (async () => new Response('')) as unknown as typeof fetch,
      credentialsPath: '/nonexistent/bunkai/credentials.json',
      prompt: { text: async () => { throw new Error('boom'); }, secret: async () => '' },
    });
    expect(await run(['auth', 'login'], d)).toBe(EXIT_FAILURE);
    expect(d.stderrText()).toBe('Unexpected error: boom\n');
  });
});
