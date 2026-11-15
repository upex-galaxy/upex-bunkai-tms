import type { OutputStream, Prompter } from './deps';
import { CliError, PromptCancelled } from './errors';

// Terminal prompts. The password is read with the terminal in raw mode and is
// never echoed, not even as asterisks (BK-1900 AC-01 "the password stays
// private"). Ctrl+C or Ctrl+D on an empty line cancels with `PromptCancelled`,
// which the login turns into exit 130 with nothing written.

export interface PromptInput {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
  setEncoding?: (encoding: BufferEncoding) => unknown
  on: (event: 'data', listener: (chunk: string | Uint8Array) => void) => unknown
  off: (event: 'data', listener: (chunk: string | Uint8Array) => void) => unknown
  resume: () => unknown
  pause: () => unknown
}

const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const BACKSPACE = '\u007F';
const CTRL_H = '\b';
const CTRL_U = '\u0015';

export const MSG_NEEDS_TERMINAL = 'The password prompt needs an interactive terminal. In CI or a script, set BUNKAI_TOKEN to a PAT created in Settings instead of signing in.';

// Reads one line from a raw-mode terminal. `echo` false = nothing is written
// back for the typed characters. Escape sequences (arrow keys) are ignored.
async function readRawLine(input: PromptInput, output: OutputStream, label: string, echo: boolean): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new CliError(MSG_NEEDS_TERMINAL));
  }
  output.write(label);
  input.setRawMode(true);
  input.setEncoding?.('utf8');
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let value = '';
    // Set once the key handler below exists; `finish` detaches it.
    const listener: { current: ((chunk: string | Uint8Array) => void) | null } = { current: null };
    const finish = (outcome: { ok: true } | { ok: false }) => {
      if (listener.current) {
        input.off('data', listener.current);
      }
      input.setRawMode?.(false);
      input.pause();
      output.write('\n');
      if (outcome.ok) {
        resolve(value);
      }
      else {
        value = '';
        reject(new PromptCancelled());
      }
    };
    const onData = (chunk: string | Uint8Array) => {
      const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      // A pasted chunk may hold several keys, so walk it character by character.
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === CTRL_C || (ch === CTRL_D && value.length === 0)) {
          finish({ ok: false });
          return;
        }
        if (ch === '\r' || ch === '\n') {
          finish({ ok: true });
          return;
        }
        if (ch === BACKSPACE || ch === CTRL_H) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (echo) {
              output.write('\b \b');
            }
          }
          continue;
        }
        if (ch === CTRL_U) {
          if (echo) {
            output.write('\b \b'.repeat(value.length));
          }
          value = '';
          continue;
        }
        if (ch === '\u001B') {
          // Skip an escape sequence such as an arrow key: ESC [ <letters/digits>.
          while (i + 1 < text.length && /[[\dA-Z~;]/i.test(text[i + 1])) {
            i++;
          }
          continue;
        }
        if (ch < ' ') {
          continue;
        }
        value += ch;
        if (echo) {
          output.write(ch);
        }
      }
    };
    listener.current = onData;
    input.on('data', onData);
  });
}

export async function readSecret(input: PromptInput, output: OutputStream, label: string): Promise<string> {
  return readRawLine(input, output, label, false);
}

export async function readText(input: PromptInput, output: OutputStream, label: string): Promise<string> {
  return readRawLine(input, output, label, true);
}

// The real terminal: prompts are written to stderr so stdout stays clean.
export function terminalPrompter(input: PromptInput, output: OutputStream): Prompter {
  return {
    text: async label => readText(input, output, label),
    secret: async label => readSecret(input, output, label),
  };
}
