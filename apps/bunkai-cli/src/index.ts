#!/usr/bin/env bun
import { homedir, hostname } from 'node:os';
import process from 'node:process';
import { credentialsPath } from './credentials';
import { terminalPrompter } from './prompt';
import { run } from './run';

// Entry point of the `bunkai` command. Prompts go to stderr so that stdout
// carries only the command's result (a table, or JSON with --json).
void run(process.argv.slice(2), {
  fetch: globalThis.fetch,
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  prompt: terminalPrompter(process.stdin, process.stderr),
  credentialsPath: credentialsPath(process.env, process.platform, homedir()),
  hostname,
  now: () => new Date(),
}).then((exitCode) => {
  process.exit(exitCode);
});
