// BK-315 — renders a Project's ATC library into an RFC4180 CSV document for a
// client-initiated download. Framework-agnostic (no Next, no Supabase),
// mirroring the BK-45/BK-46 convention of keeping testable rendering logic in a
// plain `lib/` module (`lib/traceability/export-snapshot.ts`,
// `lib/coverage/coverage-view.ts`). The rendering half is pure; BK-637 added
// the wire-side BOM contract at the bottom of this file, which touches `Response`
// and `Blob` (both Web standards, still no framework) so that the encoding rule
// and the two places that must honour it live together instead of one being a
// bare constant in a route with its consuming half implied nowhere.
//
// Business rules (Jira BK-315, `business_rules_specification`, PO Q1/Q2 rulings):
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

// A UTF-8 byte-order mark. `business-rules.md` requires "CSV, UTF-8" and this
// export's stated audience is non-technical auditors opening the file in Excel
// on Windows (story Context: "people opening this in Excel/Sheets, not
// developers reading raw CSV") — without a BOM, Windows Excel decodes a
// BOM-less .csv with the system ANSI codepage, so any non-ASCII Title/Tag
// (e.g. "Validación de pago") renders as mojibake ("ValidaciÃ³n"). A BOM fixes
// that at the cost of tripping a minority of strict RFC4180 parsers — judged
// worth it for this export's actual audience (Conductor review, optional item,
// dev-owned call).
export const UTF8_BOM = '﻿';

// Idempotent, so the BOM can be asserted on both sides of the wire without any
// risk of emitting two of them (BK-637).
export function withUtf8Bom(csv: string): string {
  return csv.startsWith(UTF8_BOM) ? csv : UTF8_BOM + csv;
}

const CSV_BLOB_TYPE = 'text/csv;charset=utf-8';

// BK-637 — the read half of the BOM contract. It returns the Blob rather than
// the string on purpose: the Blob's bytes are what actually land on disk, so
// this is the last point where the BOM can still be asserted by a test. A
// helper that stopped at the string would leave the `new Blob([...])` call
// sitting untested in a client component, which is one file away from the
// false green this ticket was filed about.
//
// Why the step exists at all: `Response.text()` runs the WHATWG "UTF-8 decode"
// algorithm, and stripping a leading BOM is part of that algorithm — not a
// runtime quirk. So the BOM the route writes onto the wire is already gone by
// the time a browser holds a string, and a Blob built from that string writes a
// BOM-less file, defeating the server-side BOM on the exact path it was added
// for. `withUtf8Bom` is idempotent, so this is also correct on a runtime that
// does not strip.
export async function csvBlobFromResponse(response: Response): Promise<Blob> {
  return new Blob([withUtf8Bom(await response.text())], { type: CSV_BLOB_TYPE });
}
