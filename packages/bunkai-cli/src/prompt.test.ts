import type { PromptInput } from './prompt';
import { describe, expect, it } from 'bun:test';
import { CliError, PromptCancelled } from './errors';
import { MSG_NEEDS_TERMINAL, readSecret, readText } from './prompt';
import { capture } from './testing/fakes';

// BK-1900 AC-01 "the password stays private" and the refined Ctrl+C scenario.

function fakeTty(opts: { isTTY?: boolean } = {}) {
  const listeners = new Set<(chunk: string) => void>();
  const rawModes: boolean[] = [];
  const input: PromptInput = {
    isTTY: opts.isTTY ?? true,
    setRawMode: (mode: boolean) => { rawModes.push(mode); },
    setEncoding: () => {},
    on: (_event, listener) => { listeners.add(listener as (chunk: string) => void); },
    off: (_event, listener) => { listeners.delete(listener as (chunk: string) => void); },
    resume: () => {},
    pause: () => {},
  };
  return { input, rawModes, type: (keys: string) => { for (const l of [...listeners]) { l(keys); } } };
}

describe('readSecret', () => {
  it('returns the typed password and echoes none of it', async () => {
    const tty = fakeTty();
    const { stream, out } = capture();
    const pending = readSecret(tty.input, stream, 'Password: ');
    tty.type('s3cret-pass');
    tty.type('\r');
    expect(await pending).toBe('s3cret-pass');
    expect(out.text).toBe('Password: \n');
    expect(out.text).not.toContain('s3cret');
    expect(out.text).not.toContain('*');
  });

  it('turns raw mode on while reading and off afterwards', async () => {
    const tty = fakeTty();
    const pending = readSecret(tty.input, capture().stream, 'Password: ');
    tty.type('x\n');
    await pending;
    expect(tty.rawModes).toEqual([true, false]);
  });

  it('handles backspace without echoing anything', async () => {
    const tty = fakeTty();
    const { stream, out } = capture();
    const pending = readSecret(tty.input, stream, 'Password: ');
    tty.type('abcd\u007F\u007Fz\r');
    expect(await pending).toBe('abz');
    expect(out.text).toBe('Password: \n');
  });

  it('cancels on Ctrl+C and restores the terminal', async () => {
    const tty = fakeTty();
    const pending = readSecret(tty.input, capture().stream, 'Password: ');
    tty.type('half-typed\u0003');
    expect(pending).rejects.toBeInstanceOf(PromptCancelled);
    await pending.catch(() => {});
    expect(tty.rawModes).toEqual([true, false]);
  });

  it('cancels on Ctrl+D at an empty prompt', async () => {
    const tty = fakeTty();
    const pending = readSecret(tty.input, capture().stream, 'Password: ');
    tty.type('\u0004');
    expect(pending).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('refuses to read a password from a non-interactive input', async () => {
    const tty = fakeTty({ isTTY: false });
    const err = await readSecret(tty.input, capture().stream, 'Password: ').catch(e => e as CliError);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).message).toBe(MSG_NEEDS_TERMINAL);
  });
});

describe('readText', () => {
  it('echoes what is typed (the email is not secret)', async () => {
    const tty = fakeTty();
    const { stream, out } = capture();
    const pending = readText(tty.input, stream, 'Email: ');
    tty.type('karim@acme.test\r');
    expect(await pending).toBe('karim@acme.test');
    expect(out.text).toBe('Email: karim@acme.test\n');
  });
});
