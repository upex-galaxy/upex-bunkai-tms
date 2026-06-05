// Framework-agnostic heuristic that pulls Acceptance-Criteria titles out of a
// Markdown string (the converted Jira issue description) for BK-17. No
// React/Next/DB imports — usable from the route handlers and unit tests alike.
// It anchors on an "Acceptance Criteria" heading/label, then collects the list
// items that follow it until the section ends.

// Matches the (stripped, trimmed) text of an anchor line: a bare "Acceptance
// Criteria" (and its short variants), optionally followed by a single colon.
const ANCHOR = /^(?:acceptance criteria|acceptance criterion|ac|criteria)\s*:?$/i;
// A Markdown list item: a `-`/`*`/`+` bullet or an ordered `1.`/`1)` marker, one
// separating space, then the title text (captured in group 1; may be padded).
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s(.*)$/;
// Any ATX heading line (`#` .. `######` followed by a space) — ends the section.
const HEADING = /^\s*#{1,6}\s/;
// A horizontal rule or a blockquote line — these can sit inside a real AC block
// (ADF emits `---` for `rule` and `> ` for `blockquote`), so skip rather than
// stop on them.
const SKIPPABLE = /^\s*(?:-{3,}|>)/;

// Strip leading `#` characters and surrounding whitespace so heading-style and
// emphasis-style anchors (`## Acceptance Criteria`, `**AC:**` once `*` trimmed)
// reduce to their bare label for the ANCHOR test.
function stripHeadingMarkers(line: string): string {
  return line.trim().replace(/^#+\s*/, '').trim();
}

// Extract Acceptance-Criteria titles from a Markdown body. Returns the list of
// trimmed item titles under the first anchor, or [] when there is no anchor or
// no list items follow it.
export function extractAcceptanceCriteria(markdown: string): string[] {
  const lines = markdown.split('\n');

  let anchorIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const stripped = stripHeadingMarkers(lines[i]).replace(/\*+/g, '').trim();
    if (ANCHOR.test(stripped)) {
      anchorIndex = i;
      break;
    }
  }
  if (anchorIndex === -1) {
    return [];
  }

  const titles: string[] = [];
  for (let i = anchorIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().length === 0) {
      continue;
    }
    if (HEADING.test(line)) {
      break;
    }
    if (SKIPPABLE.test(line)) {
      continue;
    }
    const match = line.match(LIST_ITEM);
    if (!match) {
      break;
    }
    const title = match[1].trim();
    if (title.length > 0) {
      titles.push(title);
    }
  }

  return titles;
}
