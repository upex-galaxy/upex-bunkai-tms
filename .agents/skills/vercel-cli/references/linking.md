# Linking: `.vercel/project.json` vs `.vercel/repo.json`

A directory is linked to a Vercel project when one of these files exists:

| File | Created by | Shape | When you see it |
| --- | --- | --- | --- |
| `.vercel/project.json` | `vercel link` | `{ "projectId": "...", "orgId": "..." }` | Single-project link (one app per repo) |
| `.vercel/repo.json` | `vercel link --repo` | `{ "orgId": "...", "remoteName": "...", "projects": [{ "directory": "...", "id": "..."}] }` | Monorepo link (many apps per repo) |

Vercel's default `.gitignore` entry and this boilerplate's `.gitignore` both exclude these files. They are per-developer-machine artifacts and never travel through version control.

## Detect link state safely

```bash
# Either of these means "linked"
if [ -f .vercel/project.json ] || [ -f .vercel/repo.json ]; then
  echo "linked"
else
  echo "unlinked"
fi
```

Detect state from the files, not from `vercel ls`, `vercel project inspect` or `vercel link`. Without a `.vercel/` config those commands prompt interactively, and with `--yes` they link the directory as a side effect, so a script that only wanted to check has changed the directory.

Two probes are safe in an unlinked directory:

```bash
vercel whoami          # exit 0 = authenticated, prints email/team
vercel teams ls --format json   # list teams; safe regardless of link state
```

## Single-project link

```bash
vercel link --yes
```

Creates `.vercel/project.json`. Use it when the repo has one Next.js app at the root.

## Repo-mode link (monorepo)

```bash
vercel link --repo --scope <team-slug>
```

Creates `.vercel/repo.json`. Use it when the repo has several deployable apps in subdirectories. Each app gets its own Vercel project and they share the link state file.

After a repo-mode link, run later `vercel` commands from inside the app subdirectory you want to operate on, because Vercel infers the project from the directory path.

## Re-link or switch projects

If `.vercel/` already exists and points at the wrong project:

```bash
rm -rf .vercel
vercel link --yes
```

`vercel link` detects an existing link and refuses to overwrite it, so the `rm -rf .vercel` is deliberate. It deletes only the local pointer and nothing on Vercel's side.

## Multi-team accounts

If `vercel teams ls --format json` shows more than one team, pick the team on link:

```bash
vercel link --scope <team-slug> --yes
```

Once linked, the `orgId` in `.vercel/project.json` resolves the team, so later `vercel deploy`, `vercel env` and `vercel inspect` calls can omit `--scope`.

## Defer to `/deploy-to-vercel`

First-time link decisions (which project, which team, which deploy method) belong to the community `/deploy-to-vercel` skill. This reference only helps you read the link state once it is set.

## Reference

- `vercel link` docs: <https://vercel.com/docs/cli/link>
- Vercel monorepo docs: <https://vercel.com/docs/monorepos>
