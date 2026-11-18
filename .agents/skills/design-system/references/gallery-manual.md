# Path A: Gallery manual (user-driven)

The user explores, and the skill does not match or rank. The user browses two community galleries, picks a brand off-page and hands the slug back, and the skill downloads it and lints it. Pick this path when the user wants full control, or when the default matcher (Path B) has not convinced after a couple of batches.

---

## Two gallery sources

| Source                      | Brands          | License surface              | Auth                            | Best for                                  |
| --------------------------- | --------------- | ---------------------------- | ------------------------------- | ----------------------------------------- |
| **`getdesign` catalog**     | curated         | MIT (all)                    | None                            | Quality-vetted picks, deterministic slugs |
| **`designmd.ai` community** | community       | MIT / CC0 / CC-BY / CC-BY-SA | Free API key `DESIGNMD_API_KEY` | Variety, niche styles, recent uploads     |

Offer both. The `getdesign` set is small, every entry is hand-tuned and all are MIT. `designmd.ai` is roughly 4x larger, but quality and license vary per entry.

---

## Browsing

### `getdesign` catalog

In the CLI (fast, no network beyond the registry):

```bash
npx --yes getdesign list                       # plain table
npx --yes getdesign list --json | jq '.[].name'  # filter by name
npx --yes getdesign list --json | jq '.[] | select(.tags[] | contains("dark"))'
```

`getdesign` has no web gallery, so listing is CLI-only.

### `designmd.ai` community

In the browser: open `https://designmd.ai/explore` and filter by tag (saas, dark, clean, minimal, dashboard, bold, light, component-library, warm, mobile-app, landing-page, premium).

In the CLI (requires the free API key for download, not for search):

```bash
export DESIGNMD_API_KEY=dk_your-key-here   # free at designmd.ai/cli
npx --yes designmd search "dark fintech"
npx --yes designmd search "wellness" --tag warm --sort downloads
npx --yes designmd get shafius/neon-fintech --json   # full DESIGN.md preview
```

---

## Picking flow

The user sets the criteria off-page, with no AI matching. Once they have a choice, they give the skill one of two things:

- A `getdesign` slug, a single word such as `linear-app`, `vercel` or `notion`.
- A `designmd.ai` handle in `<user>/<slug>` form, such as `shafius/neon-fintech`.

A `/` in the input means the `designmd.ai` source.

---

## Download

From `getdesign`:

```bash
npx --yes getdesign add <slug>
# or with custom path from .agents/project.yaml:
npx --yes getdesign add <slug> --out "$DESIGN_MD_PATH"
```

From `designmd.ai`:

```bash
export DESIGNMD_API_KEY=dk_your-key-here
npx --yes designmd download <user>/<slug>
# default output is ./DESIGN.md; pass -o to override:
npx --yes designmd download <user>/<slug> -o "$DESIGN_MD_PATH"
```

If `DESIGN.md` already exists, use the same skip, overwrite or variant prompt as `getdesign-matcher.md` step 6, and never overwrite silently. With nobody to ask, write a variant (`SKILL.md`, "With nobody at the keyboard").

---

## Validation

Same lint step as the default path:

```bash
npx --yes @google/design.md lint <path>
```

Show the user every error and WCAG warning, including the ones that do not block.

---

## License surface

After download, print the chosen brand's license so the user knows what they are committing to. `getdesign` entries are all MIT. `designmd.ai` entries vary: read the `license` field from `designmd get <user>/<slug> --json` before download, or from the frontmatter of the downloaded `DESIGN.md`. Put a short note in the final report:

```
Brand:     shafius/neon-fintech
Source:    designmd.ai community gallery
License:   CC-BY 4.0  (attribution required, credit `shafius` if you redistribute)
Path:      ./DESIGN.md
Lint:      PASS
```

CC-BY-SA in particular puts attribution and share-alike obligations on derivative DESIGN.md files. MIT and CC0 are usually safe for any project, while CC-BY and CC-BY-SA may not fit the project's license posture. The user sees the license before merging.
