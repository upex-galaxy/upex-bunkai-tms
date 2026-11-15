// Exit codes are part of the CLI's contract with scripts (BK-1900 TL-6):
// zero for success (an empty result included), non-zero for any failure.
export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
export const EXIT_CANCELLED = 130;

// An expected failure: its message is written for a person, goes to stderr as
// is, and the command exits with `exitCode`. Nothing else ever reaches the
// user as a stack trace.
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_FAILURE) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export function usageError(message: string): CliError {
  return new CliError(message, EXIT_USAGE);
}

// Raised by the prompt when the person presses Ctrl+C (or closes the input).
export class PromptCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PromptCancelled';
  }
}

export const MSG_NOT_SIGNED_IN = 'You are not signed in. Run "bunkai auth login" first.';
export const MSG_SIGN_IN_INVALID = 'Your sign-in is no longer valid (the PAT was revoked or has expired). Run "bunkai auth login" to sign in again.';
export const MSG_TOKEN_INVALID = 'The PAT in BUNKAI_TOKEN is not valid (revoked, expired or mistyped). Create a new one in Settings, or unset BUNKAI_TOKEN and run "bunkai auth login".';
