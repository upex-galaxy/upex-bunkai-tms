import type { StoryTraceabilityPayload, TraceabilityAtc, TraceabilityCriterion } from './chain-view';
import {
  defectCellPlaceholder,
  isAcUncovered,
  resolveAtcRowState,
  resolveStoryChainViewState,
  runCellPlaceholder,
  runChipLabel,
  storyRollupCounts,
  testCellCopy,
  UNCOVERED_LABEL,
  UNCOVERED_WHY,
  ZERO_AC_BODY,
  ZERO_AC_TITLE,
  ZERO_COVERAGE_HEADING,
  zeroCoverageBody,
} from './chain-view';

// BK-50 — renders an already-fetched evidence chain into a single
// self-contained HTML document (inline styles, zero external references,
// zero network calls) for a client-initiated download. Pure and
// framework-agnostic (no React, no Next, no DOM) so it is testable with
// `bun:test` without a browser, mirroring `chain-view.ts`'s own split
// (BK-45/BK-46 convention: no `.test.tsx` component tests exist anywhere in
// this repo — testable logic lives in a pure `lib/` module, components stay
// thin and are validated live).
//
// Ratified mechanism + v1 scope: Jira BK-50 comments 12238 (AI Tech Lead)
// and 12239 (AI Product Owner), 2026-08-08 — Option E, a synchronous
// client-initiated download of a static document. No storage, no anonymous
// surface, no `snapshots` table, no migration. Reuses `chain-view.ts`'s own
// state-resolution helpers so the exported document can never disagree with
// what the live screen renders for the same payload.

export interface SnapshotIdentity {
  workspaceName: string
  projectName: string
}

export interface RenderSnapshotOptions {
  exportedAt: Date
  identity: SnapshotIdentity
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// "Aug 8, 2026, 15:32" — the human-readable export instant, embedded in the
// document header/footer and the confirmation toast.
export function formatSnapshotTimestamp(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// "20260808-1532" — sortable, filename-safe stamp.
function fileStamp(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    // The 60-char slice can land right after a hyphen, leaving a trailing
    // one (and, chained into `trace-<slug>-<stamp>`, a stray double hyphen).
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : 'story';
}

// Mockup pattern (`traceability-chain.html:1021`): `trace-<story>-YYYYMMDD-HHMM`.
// Deliberate, ratified departure from the mockup's `.json` extension to
// `.html` — logged as `master-design-plan.md` §5 divergence row D26, per
// Critical Rule #15 and the PO ruling (comment 12239 §4): the consumer is a
// human auditor and AC3.1 requires rendered prose for the empty-chain case,
// not a data structure.
export function buildSnapshotFilename(storyTitle: string, exportedAt: Date): string {
  return `trace-${slugify(storyTitle)}-${fileStamp(exportedAt)}.html`;
}

const SNAPSHOT_CSS = `
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 2rem; color: #1a1a1a; background: #fff; line-height: 1.5; }
  h1 { font-size: 1.25rem; margin: 0.25rem 0; }
  h2 { font-size: 1rem; margin: 0; }
  .snap-eyebrow { font-family: ui-monospace, monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
  .snap-meta { font-size: 0.8rem; color: #555; }
  .snap-archived, .snap-banner { margin-top: 0.75rem; padding: 0.6rem 0.8rem; border: 1px solid #e0b400; background: #fff8e1; border-radius: 4px; font-size: 0.85rem; }
  .snap-head { border-bottom: 1px solid #ddd; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .snap-ac { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 1rem; overflow: hidden; }
  .snap-ac-head { display: flex; justify-content: space-between; padding: 0.6rem 0.9rem; background: #f7f7f7; border-bottom: 1px solid #ddd; font-weight: 600; }
  .snap-muted { color: #777; font-weight: 400; font-size: 0.8rem; }
  .snap-uncovered { padding: 0.7rem 0.9rem; color: #b42318; font-size: 0.85rem; }
  .snap-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .snap-table th { text-align: left; padding: 0.4rem 0.9rem; background: #fafafa; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #777; border-bottom: 1px solid #eee; }
  .snap-table td { padding: 0.55rem 0.9rem; border-top: 1px solid #eee; vertical-align: top; }
  .snap-mono { font-family: ui-monospace, monospace; font-size: 0.75rem; color: #777; }
  .snap-chip { display: inline-block; font-size: 0.65rem; padding: 0 0.35rem; border: 1px solid #ccc; border-radius: 999px; color: #555; }
  .snap-empty { text-align: center; padding: 3rem 1rem; color: #444; }
  .snap-empty-stamp { font-weight: 600; }
  .snap-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.75rem; color: #888; }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The full self-contained document: inline <style>, no external stylesheet,
// font, image, or script — an auditor can open the file offline, forever.
export function renderTraceabilitySnapshotHtml(
  payload: StoryTraceabilityPayload,
  options: RenderSnapshotOptions,
): string {
  const { exportedAt, identity } = options;
  const timestamp = formatSnapshotTimestamp(exportedAt);
  const viewState = resolveStoryChainViewState(payload);
  const counts = storyRollupCounts(payload);

  const body = viewState === 'zero-ac'
    ? renderNoCoverageSection(timestamp)
    : renderChainSection(payload, viewState);

  const archivedBanner = payload.story.archived_at !== null
    ? '<div class="snap-archived">This story was archived. The chain below reflects its coverage as of archiving.</div>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`Evidence chain — ${payload.story.title}`)}</title>
<style>${SNAPSHOT_CSS}</style>
</head>
<body>
<header class="snap-head">
  <div class="snap-eyebrow">${escapeHtml(identity.workspaceName)} / ${escapeHtml(identity.projectName)} · read-only snapshot</div>
  <h1>${escapeHtml(payload.story.title)}</h1>
  <div class="snap-meta">Exported ${escapeHtml(timestamp)} · ${counts.acCount} ACs · ${counts.atcCount} ATCs · ${counts.testCount} tests · ${counts.runCount} runs · ${counts.defectCount} defects</div>
  ${archivedBanner}
</header>
<main>
${body}
</main>
<footer class="snap-footer">Read-only capture as of ${escapeHtml(timestamp)}. Later changes to the live chain will not appear here.</footer>
</body>
</html>`;
}

function renderNoCoverageSection(timestamp: string): string {
  return `<div class="snap-empty">
  <h2>${escapeHtml(ZERO_AC_TITLE)}</h2>
  <p>${escapeHtml(ZERO_AC_BODY)}</p>
  <p class="snap-empty-stamp">This story had no coverage as of ${escapeHtml(timestamp)}.</p>
</div>`;
}

function renderChainSection(payload: StoryTraceabilityPayload, viewState: 'zero-coverage' | 'has-chain'): string {
  const banner = viewState === 'zero-coverage'
    ? `<div class="snap-banner">${escapeHtml(ZERO_COVERAGE_HEADING)} ${escapeHtml(zeroCoverageBody(payload.criteria.length))}</div>`
    : '';
  return `${banner}${payload.criteria.map(renderAcCard).join('\n')}`;
}

function renderAcCard(ac: TraceabilityCriterion): string {
  if (isAcUncovered(ac)) {
    return `<section class="snap-ac">
  <div class="snap-ac-head"><span>${escapeHtml(ac.title)}</span><span class="snap-muted">0 ATCs</span></div>
  <div class="snap-uncovered">${escapeHtml(UNCOVERED_LABEL)} ${escapeHtml(UNCOVERED_WHY)}</div>
</section>`;
  }

  return `<section class="snap-ac">
  <div class="snap-ac-head"><span>${escapeHtml(ac.title)}</span><span class="snap-muted">${ac.atcs.length} ${ac.atcs.length === 1 ? 'ATC' : 'ATCs'}</span></div>
  <table class="snap-table">
    <thead><tr><th>ATC · layer</th><th>Test</th><th>Latest run</th><th>Defects</th></tr></thead>
    <tbody>
${ac.atcs.map(renderAtcRow).join('\n')}
    </tbody>
  </table>
</section>`;
}

function renderAtcRow(atc: TraceabilityAtc): string {
  const rowState = resolveAtcRowState(atc);
  const testCopy = testCellCopy(rowState);
  const runPlaceholder = runCellPlaceholder(rowState);
  const defectPlaceholder = defectCellPlaceholder(rowState, atc.defects.length);

  const testCell = testCopy ?? escapeHtml(atc.test?.title ?? '');
  const runCell = runPlaceholder ?? (atc.latest_run ? escapeHtml(runChipLabel(atc.latest_run)) : '');
  const defectCell = defectPlaceholder
    ?? atc.defects.map(d => `${escapeHtml(d.title)} (${escapeHtml(d.status)})`).join(', ');

  return `      <tr>
        <td><span class="snap-mono">${escapeHtml(atc.slug)}</span> <span class="snap-chip">${escapeHtml(atc.layer)}</span><br>${escapeHtml(atc.title)}</td>
        <td>${testCell}</td>
        <td>${runCell}</td>
        <td>${defectCell}</td>
      </tr>`;
}
