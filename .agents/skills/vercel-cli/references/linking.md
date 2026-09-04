# Linking — `.vercel/project.json` vs `.vercel/repo.json`

A directory is "linked" to a Vercel project when one of these files exists:

| File                     | Created by                  | Shape                                                                                    | When you see it                       |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| `.vercel/project.json`   | `vercel link`               | `{ "projectId": "...", "orgId": "..." }`                                                 | Single-project link (one app per repo) |
| `.vercel/repo.json`      | `vercel link --repo`        | `{ "orgId": "...", "remoteName": "...", "projects": [{ "directory": "...", "id": "..."}] }` | Monorepo link (many apps per repo)    |

Both files are git-ignored by Vercel's default `.gitignore` entry (and by this boilerplate's `.gitignore`). They are per-developer-machine artifacts, NOT shared via VCS.

## Detect link state safely

```bash
# Either of these means "linked"
if [ -f .vercel/project.json ] || [ -f .vercel/repo.json ]; then
  echo "linked"
else
  echo "unlinked"
fi
```

**Do NOT** use `vercel ls`, `vercel project inspect`, or `vercel link` for state detection — without a `.vercel/` config they prompt interactively. With `--yes` added, they silently link as a side-effect, which is even worse: the script now mutates the directory just by checking.

The ONLY safe state probes in an unlinked directory:

```bash
vercel whoami          # exit 0 = authenticated, prints email/team
vercel teams ls --format json   # list teams; safe regardless of link state
```

## Single-project link

```bash
vercel link --yes
```

Creates `.vercel/project.json`. Use when the repo has one Next.js app at the root.

## Repo-mode link (monorepo)

```bash
vercel link --repo --scope <team-slug>
```

Creates `.vercel/repo.json`. Use when the repo has multiple deployable apps in subdirectories. Each app gets its own Vercel project but shares the link state file.

After repo-mode link, run subsequent `vercel` commands from inside the app subdirectory you want to operate on — Vercel infers which project from the directory path.

## Re-link or switch projects

If `.vercel/` already exists and points at the wrong project:

```bash
rm -rf .vercel
vercel link --yes
```

`vercel link` without removing first will detect the existing link and refuse to overwrite. The `rm -rf .vercel` step is intentional — it does NOT delete anything on Vercel's side, only the local pointer.

## Multi-team accounts

If `vercel teams ls --format json` shows more than one team:

```bash
# Pick the team explicitly on link
vercel link --scope <team-slug> --yes
```

Once linked, the `orgId` in `.vercel/project.json` resolves the team automatically — you can omit `--scope` on subsequent `vercel deploy`, `vercel env`, `vercel inspect` calls.

## Defer to `/deploy-to-vercel`

For first-time link decisions (which project, which team, deploy method selection), defer to the community `/deploy-to-vercel` skill. That skill owns the decision tree; this reference exists only to help you READ the link state once it's set.

## Reference

- `vercel link` docs: <https://vercel.com/docs/cli/link>
- Vercel monorepo docs: <https://vercel.com/docs/monorepos>
