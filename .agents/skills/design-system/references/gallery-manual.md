# Path A — Gallery manual (user-driven)

User-driven exploration. The skill does not match or rank — the user browses two community galleries, picks a brand off-page, then hands the slug back to the skill for download + lint. Pick this path when the user wants full control, or when the default (Path B) matcher fails to convince after a couple of batches.

---

## Two gallery sources

| Source                      | Brands          | License surface              | Auth                            | Best for                                  |
| --------------------------- | --------------- | ---------------------------- | ------------------------------- | ----------------------------------------- |
| **`getdesign` catalog**     | 72 (curated)    | MIT (all)                    | None                            | Quality-vetted picks, deterministic slugs |
| **`designmd.ai` community** | 278 (community) | MIT / CC0 / CC-BY / CC-BY-SA | Free API key `DESIGNMD_API_KEY` | Variety, niche styles, recent uploads     |

Why two: the `getdesign` set is small but every entry has been hand-tuned and is licensed MIT. `designmd.ai` is roughly 4x larger but quality and license vary per entry. Surface both — let the user pick.

---

## Browsing

### `getdesign` catalog

In the CLI (fast, no network beyond the registry):

```bash
npx --yes getdesign list                       # plain table
npx --yes getdesign list --json | jq '.[].name'  # filter by name
npx --yes getdesign list --json | jq '.[] | select(.tags[] | contains("dark"))'
```

No web gallery for `getdesign` — listing is CLI-only.

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

The user decides their criteria off-page (no AI matching). Once they have a choice, they give the skill either:

- A `getdesign` slug — single word, e.g. `linear-app`, `vercel`, `notion`.
- A `designmd.ai` handle — `<user>/<slug>` form, e.g. `shafius/neon-fintech`.

The skill detects which source by the presence of `/` in the input.

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

If `DESIGN.md` already exists, follow the same skip / overwrite / variant prompt documented in `getdesign-matcher.md` step 6. Do not silently overwrite.

---

## Validation

Same lint step as the default path:

```bash
npx --yes @google/design.md lint <path>
```

Surface errors and WCAG warnings to the user. Do not paper over failures.

---

## License surface

After download, print the license of the chosen brand so the user knows what they are committing to. `getdesign` entries are all MIT. `designmd.ai` entries vary — read the `license` field from `designmd get <user>/<slug> --json` before download, or from the frontmatter of the downloaded `DESIGN.md`. Surface a short note in the final report:

```
Brand:     shafius/neon-fintech
Source:    designmd.ai community gallery
License:   CC-BY 4.0  (attribution required — credit `shafius` if you redistribute)
Path:      ./DESIGN.md
Lint:      PASS
```

Why this matters: CC-BY-SA in particular forces downstream attribution and share-alike obligations on derivative DESIGN.md files. MIT and CC0 are usually safe for any project; CC-BY and CC-BY-SA may not match the project's license posture. The user should see the license before merging.
