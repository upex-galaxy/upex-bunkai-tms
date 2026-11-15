# bunkai CLI

The `bunkai` command line: sign in once from a terminal, then find ATCs in a Project from a script, a CI job or an AI agent, without building authenticated HTTP calls by hand.

This first slice has two commands, `bunkai auth login` and `bunkai atc list`. Starting a Run and importing results are later stories, and so is publishing the CLI as a package or a binary. For now it runs from a checkout of this repository.

## Run it

From the repository root:

```bash
bun run bunkai auth login
bun run bunkai atc list --project checkout-v2 --query login
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

- the PAT reads ATCs only (`atc:read`), expires after 90 days, and is named `bunkai-cli <your machine>` in Settings, where you can revoke it at any time;
- your default Workspace, which is the one the API reports as active at sign-in (for a new sign-in, the oldest Workspace you belong to).

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

## CI and scripts

Do not sign in from a CI job. Create a PAT with `atc:read` in Settings and give it to the job as `BUNKAI_TOKEN`:

```bash
BUNKAI_TOKEN=bk_pat_… bunkai atc list --project checkout-v2 --query login --json
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
| 0 | Success, including a search with no match. |
| 1 | Any failure: wrong credentials, not signed in, a revoked or expired PAT, Project or Module not found, network or server error. |
| 2 | The command line itself is wrong: unknown command or option, missing `--project`, a missing or blank `--query`, `--limit` out of range. |
| 130 | Cancelled with Ctrl+C. |

When a PAT is revoked or expires, the next command (or the current one, if it happens mid-command) says the sign-in is no longer valid and to run `bunkai auth login`. The CLI never prints a stack trace.

## Develop

The whole CLI is one function, `run(argv, deps)` in `src/run.ts`, that returns an exit code. Every effect (HTTP, the terminal, the file system, the clock) comes in through `deps`, so each behaviour is tested with fakes next to the code (`src/**/*.test.ts`). The package imports nothing from the web app's server code.
