// BK-315 — renders a Project's ATC library into an RFC4180 CSV document for a
// client-initiated download. Pure and framework-agnostic (no Next, no
// Supabase), mirroring the BK-45/BK-46 convention of keeping testable
// rendering logic in a plain `lib/` module (`lib/traceability/export-snapshot.ts`,
// `lib/coverage/coverage-view.ts`).
//
// Business rules (Jira BK-315, `customfield_10054`, PO Q1/Q2 rulings):
//   - Fixed column order: ATC ID, Slug, Title, Module, Layer, Tags, Status.
//   - ATC ID is the raw `atcs.id` UUID — this codebase has an explicit,
//     repeated ruling (master-design-plan.md §5 D32) against inventing a
//     human-readable code sequence for an entity that has none; reused here
//     rather than re-litigated.
//   - Tags join with "; " (semicolon-space, PO Q1) into ONE cell, THEN that
//     joined string runs through the SAME generic escape as every other
//     column — this is what makes a tag's own comma/quote (AC 4.4/4.5) fall
//     out for free instead of needing a second escaping path.
//   - Any cell containing a comma, a double quote, or a line break is quoted;
//     an embedded double quote is doubled. Applied to every column generically
//     (the business rule says "any field", not just Title).
//   - A Project with zero ATCs still exports — header row only, never an error.
//
// CSV formula-injection neutralization (Conductor review of PR #207, MAJOR;
// AI Tech Lead decision on BK-315, Jira comment): a cell whose content begins
// with `=+-@` or a tab/CR executes as a formula when opened in Excel/Sheets —
// RFC4180 quoting alone does not stop this, since the spreadsheet evaluates
// the cell AFTER unquoting. A leading `'` is prepended before escaping
// (OWASP guidance) to force literal-text treatment. Applied generically to
// every column, same reasoning as the escaping rule. Tradeoff: an affected
// cell's exported value differs from the stored value by one leading
// character — a deliberate, visible security marker, not data loss.

export interface AtcExportRow {
  id: string
  slug: string
  title: string
  module_path: string
  layer: string
  tags: string[]
  status: string
}

const CSV_HEADER = ['ATC ID', 'Slug', 'Title', 'Module', 'Layer', 'Tags', 'Status'];
const TAG_DELIMITER = '; ';
const ROW_SEPARATOR = '\r\n';

// OWASP CSV-injection guidance: a spreadsheet treats a cell starting with any
// of these as a formula, not literal text.
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

function neutralizeFormulaPrefix(value: string): string {
  return value.length > 0 && FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value;
}

// RFC4180 §2.6/2.7: quote a field that contains the delimiter, a double
// quote, or a line break; double every embedded double quote. Formula
// neutralization runs first — see the module header.
function csvEscapeField(value: string): string {
  const safe = neutralizeFormulaPrefix(value);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function csvRow(fields: string[]): string {
  return fields.map(csvEscapeField).join(',');
}

// Deterministic order: the raw table read carries no ORDER BY, and grouping
// by module is more useful to a human auditor than arbitrary insertion order.
// Dev-owned presentation choice, not a product decision.
function sortRows(rows: AtcExportRow[]): AtcExportRow[] {
  return [...rows].sort((a, b) => {
    const byModule = a.module_path.localeCompare(b.module_path);
    return byModule !== 0 ? byModule : a.slug.localeCompare(b.slug);
  });
}

export function renderAtcsCsv(rows: AtcExportRow[]): string {
  const lines = [csvRow(CSV_HEADER)];
  for (const row of sortRows(rows)) {
    lines.push(csvRow([
      row.id,
      row.slug,
      row.title,
      row.module_path,
      row.layer,
      row.tags.join(TAG_DELIMITER),
      row.status,
    ]));
  }
  return lines.join(ROW_SEPARATOR) + ROW_SEPARATOR;
}

export function atcsExportFilename(projectSlug: string): string {
  return `${projectSlug}-atcs.csv`;
}
