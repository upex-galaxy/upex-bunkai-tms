# Presentations

Standalone HTML decks about Bunkai. Each one is a single self-contained file:
open it in a browser, no build, no dev server, no auth. The only external
requests are the Google Fonts stylesheets.

| File | Language | Slides |
| --- | --- | --- |
| `bunkai-product-tour.html` | English | 15 |
| `bunkai-product-tour-es.html` | Spanish | 15 |

Keyboard: `←` `→` navigate, `O` slide grid, `F` fullscreen, `N` speaker notes,
`#/7` in the URL jumps to a slide.

## Relationship to `/about`

The in-app route `/about` is the canonical explainer — it is richer (big-picture
map, eight-step walkthrough, mini-mockups of the real screens) and it lives next
to the product, so it drifts with the design system rather than against it.

These decks exist for the cases `/about` cannot cover: presenting on a projector
or a call, sending the file to someone who has no access to the app, or talking
through the product with no network. The English deck also has no in-app
equivalent, since `/about` is Spanish-only.

Consequence worth knowing: the same claims now live in three places. When the
product changes materially — a new execution mode, a capability moving from
"próximo" to "listo" — `/about` is the one that must be updated first, and these
decks are updated only if they are about to be presented. Treat a stale deck as
expected, not as a defect.

## Design tokens

Both decks inline the tokens from `DESIGN.md` §3–§5 (surfaces, foreground tiers,
strokes, vermillion accent, signal palette, layer palette, radii, shadows). The
type ramp is scaled up for projection — the app's 13px base is unreadable on a
screen across a room — but every ratio and every colour is byte-exact with the
app. Rebranding means updating `DESIGN.md`, `app/globals.css`, and the `:root`
block at the top of each deck.
