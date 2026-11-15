// Everything the CLI touches outside its own memory, injected so every
// acceptance scenario runs as a unit test with fakes (BK-1900 TL-1).

export interface OutputStream {
  write: (chunk: string) => unknown
}

export interface Prompter {
  // A visible line of input (the email).
  text: (label: string) => Promise<string>
  // A hidden line of input (the password): never echoed, never stored.
  secret: (label: string) => Promise<string>
}

export interface Deps {
  fetch: typeof fetch
  env: Record<string, string | undefined>
  stdout: OutputStream
  stderr: OutputStream
  prompt: Prompter
  // Where the saved sign-in lives (resolved once per run).
  credentialsPath: string
  hostname: () => string
  now: () => Date
}
