# bunkai CLI

The `bunkai` command line: sign in once from a terminal, then find ATCs in a Project and start Runs from a script, a CI job or an AI agent, without building authenticated HTTP calls by hand.

It has three commands: `bunkai auth login`, `bunkai atc list` and `bunkai run start`. Following a Run, reporting its step results from the terminal and importing results are later stories, and so is publishing the CLI as a package or a binary. For now it runs from a checkout of this repository.

## Run it

From the repository root:

```bash
bun run bunkai auth login
bun run bunkai atc list --project checkout-v2 --query login
bun run bunkai run start --project checkout-v2 --test <test-id> --env Staging
```

To get a real `bunkai` command on your PATH, link the package once:

```bash
cd apps/bunkai-cli && bun link
bunkai --help
```

The CLI needs Bun and nothing else: it has no runtime dependencies and talks only to the public API (`/api/v1`).

## Sign in

```bash
bunkai auth login [--email <email>] [--api-url <url>]
```

You type your email and your password. The password prompt shows nothing while you type, not even asterisks. The password is sent once to the sign-in and then dropped.

What the CLI keeps is a PAT, not the password:

- the PAT can read ATCs (`atc:read`) and execute Runs (`run:execute`), expires after 90 days, and is named `bunkai-cli <your machine>` in Settings, where you can revoke it at any time. Executing Runs covers more than starting one: through the API the same PAT can report step results, attach evidence, submit results and finish or abort a Run. It cannot change ATCs or administer the Workspace;
- your default Workspace, which is the one the API reports as active at sign-in (for a new sign-in, the oldest Workspace you belong to).

A sign-in made before `bunkai run start` existed holds a PAT that only reads ATCs. It keeps working for `bunkai atc list`; `bunkai run start` says it cannot start Runs and asks you to run `bunkai auth login` again.

Each sign-in creates a new PAT. The previous one stays valid until it expires or you revoke it in Settings: a PAT cannot revoke other PATs, so signing out will come with a later story.

The sign-in only accepts accounts that have a password. An account that only signs in with a magic link, GitHub or Google has none. The refusal message says so; it is the same message as for a wrong password, because the sign-in never reveals which accounts exist.

Pressing Ctrl+C at a prompt cancels with exit code 130 and saves nothing. A wrong password, a network failure or a server error also save nothing.

## Where the sign-in is saved

| System | File |
| --- | --- |
| Linux, macOS | `$XDG_CONFIG_HOME/bunkai/credentials.json`, else `~/.config/bunkai/credentials.json` |
| Windows | `%APPDATA%\bunkai\credentials.json` |
| Any (override) | `$BUNKAI_CONFIG_DIR/credentials.json` |

On Linux and macOS the file is created readable and writable by your user only (mode `0600`), in a folder only you can open (`0700`), and it never exists with wider permissions, not even while it is being written. If something later opens it up, every command warns you. Windows does not use these mode bits: there the file is protected by your user profile's own permissions.

The file holds the API URL, the PAT and its expiry, your email and your default Workspace. Never the password.

## Find ATCs

```bash
bunkai atc list --project <slug|id> --query <text> [--module <path|name>] [--limit <n>] [--json]
```

- `--project`: the slug from the Project's web address (`checkout-v2`) or its id, in your default Workspace. A Project in another Workspace answers exactly like one that does not exist: `Project not found`.
- `--query`: the text to search for. Required; an empty text is refused.
- `--module`: only this Module and its sub-Modules. Give its path (`payments/cards`) or its name (`Payments`). When several Modules share a name, the CLI lists their paths and asks for one.
- `--limit`: 1 to 50, default 20. There is no paging; when the result fills the limit, a note says more matches may exist.
- `--json`: print only a JSON array on stdout.

Results come best match first, in the same order as the search in the web app (text relevance weighted by recency). The table shows each ATC's title, layer and Module path. When nothing matches you see `No ATCs found.` and the exit code is 0; with `--json` you get `[]`.

### Output for scripts

With `--json`, stdout carries only the JSON document:

```json
[
  {
    "id": "…",
    "slug": "login-with-valid-credentials",
    "title": "Login with valid credentials",
    "layer": "UI",
    "status": "active",
    "module_path": "auth/login"
  }
]
```

Every message meant for a person (errors, warnings, the "first N matches" note, the sign-in prompts) goes to stderr, so `bunkai atc list … --json | jq` always reads clean JSON.

## Start a Run

```bash
bunkai run start --project <slug|id> --test <id> --env <name> [--executor human|agent|ci] [--retry-key <key>] [--json]
```

- `--project`: the slug or id of a Project in your default Workspace, as for `atc list`.
- `--test`: the Test's id (the UUID in its web address).
- `--env`: the environment's name. Letter case and surrounding spaces are ignored (`' staging '` finds `Staging`). An unknown name lists the Project's environments; a Project with none says to add one in the web app.
- `--executor`: who runs it. `human` (the default) is recorded as you; the web app shows it as a Manual Run reported by the PAT's name. `agent` and `ci` mark an automated Run. An `agent` or `ci` Run with no step result for 60 minutes is closed automatically, and the command reminds you on stderr.
- `--retry-key`: 1 to 200 characters, surrounding spaces trimmed. See below.
- `--json`: print only one JSON object on stdout.

It starts the Run exactly as the web app does: the Run takes a snapshot of the Test's steps, needs write access in the Workspace, and is refused for a Test with no executable steps or an archived Test. The summary shows the Run id, the Test, the environment, the executor, the status, the Workspace and a link (`<Bunkai URL>/projects/<slug>/runs/<id>`). The link opens in the web app's active Workspace, so it works when that is your CLI default Workspace.

### Retry key

Without `--retry-key`, every start is a new Run. With one, repeating the same command within 24 hours returns the Run that key started instead of a second one, also when two copies run at the same time. A key belongs to one Test: the same key on another Test starts a new Run, and so does the same key after 24 hours.

- The Run behind the key may already be closed (`passed`, `failed`, `aborted`): you get it with its status, exit 0, and a note to use a new key to start another Run.
- A key already used with another environment or executor is refused (exit 1) with that Run's environment, executor and link: nothing is started, use a new key.
- When the outcome is unknown (the connection dropped, no answer within 30 seconds, a server error, an answer that could not be read), the command says the Run may or may not have started and prints the exact `--retry-key` to repeat with. It never retries by itself. Without a key of yours it sends one it made up and prints that one, so the repeat is still safe; a key it made up is lost if you press Ctrl+C, so give your own key in scripts.

### Output for scripts

With `--json`, stdout carries only this object (stdout stays empty when the start fails):

```json
{
  "id": "…",
  "url": "https://upexbunkai.vercel.app/projects/checkout-v2/runs/…",
  "status": "running",
  "replayed": false,
  "test_id": "…",
  "test_title": "Checkout with a saved card",
  "project_id": "…",
  "environment_id": "…",
  "environment_name": "Staging",
  "executor_mode": "agent",
  "started_at": "2026-11-17T02:00:00.000Z"
}
```

`replayed` is `true` when the retry key returned an existing Run. To step through the Run, read it through the API with the same PAT (`GET /api/v1/runs/{id}`): it carries every step id.

## CI and scripts

Do not sign in from a CI job. Create a PAT in Settings and give it to the job as `BUNKAI_TOKEN`: `atc:read` is enough for `atc list`, and `run start` needs `atc:read` and `run:execute`.

```bash
BUNKAI_TOKEN=bk_pat_… bunkai atc list --project checkout-v2 --query login --json
BUNKAI_TOKEN=bk_pat_… bunkai run start --project checkout-v2 --test <test-id> --env Staging --executor ci --retry-key "$CI_PIPELINE_ID" --json
```

When `BUNKAI_TOKEN` is set, every command uses it, ignores the saved sign-in and writes nothing to disk. The default Workspace is read from the API on each run.

## Environment

| Variable | Effect |
| --- | --- |
| `BUNKAI_TOKEN` | Use this PAT instead of the saved sign-in. |
| `BUNKAI_API_URL` | Talk to this Bunkai instead of the saved one (or the default production URL). With a saved sign-in for another address, the CLI warns on stderr that the saved PAT is sent there. |
| `BUNKAI_CONFIG_DIR` | Keep the saved sign-in in this folder. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, including a search with no match, and a retry key that returned the Run it started before. |
| 1 | Any failure: wrong credentials, not signed in, a revoked or expired PAT, a PAT without a needed scope, Project, Module, environment or Test not found, a Run that cannot be started, a retry key used for another environment or executor, an unknown start outcome, network or server error. |
| 2 | The command line itself is wrong: unknown command or option, a missing required option, a blank `--query`, `--env` or `--retry-key`, `--limit` out of range, a `--test` that is not a UUID, an `--executor` other than `human`, `agent` or `ci`, a `--retry-key` longer than 200 characters. |
| 130 | Cancelled with Ctrl+C. |

When a PAT is revoked or expires, the next command (or the current one, if it happens mid-command) says the sign-in is no longer valid and to run `bunkai auth login`. The CLI never prints a stack trace.

## Develop

The whole CLI is one function, `run(argv, deps)` in `src/run.ts`, that returns an exit code. Every effect (HTTP, the terminal, the file system, the clock) comes in through `deps`, so each behaviour is tested with fakes next to the code (`src/**/*.test.ts`). The package imports nothing from the web app's server code.
