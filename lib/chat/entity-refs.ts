// BK-218 — pure core of the Team Chat rich entity links: reference syntax
// (parse / build), the entity-specific status vocabularies, and the card
// contract shared by the resolver API and the chat UI. No Supabase import and
// no side effects, so every decision here is unit-testable.
//
// Reference = the entity's in-app deep link, `/projects/{slug}/{atcs|tests|runs}/{uuid}`
// (optionally prefixed by a Bunkai origin). Pasting the link in the browser and
// the composer picker both produce exactly that text, so a message body stays
// plain text and the card is derived at render time (state is always current).

export type EntityType = 'atc' | 'test' | 'run';

export interface EntityRef {
  type: EntityType
  id: string
  projectSlug: string
}

export const MAX_REFS_PER_RESOLVE = 20;

const PATH_SEGMENT: Record<EntityType, string> = { atc: 'atcs', test: 'tests', run: 'runs' };
const TYPE_BY_SEGMENT: Record<string, EntityType> = { atcs: 'atc', tests: 'test', runs: 'run' };

const UUID = '[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}';
export const UUID_RE = new RegExp(`^${UUID}$`, 'i');

// Origin is optional; when present it must be one of the allowed Bunkai
// origins, so a link to an unrelated site with a look-alike path stays text.
function buildRefRegex(): RegExp {
  return new RegExp(`(https?://[^\\s/]+)?(/projects/([a-z\\d][a-z\\d-]*)/(atcs|tests|runs)/(${UUID}))(?![\\w/-])`, 'gi');
}

export type BodySegment
  = | { kind: 'text', text: string }
    | { kind: 'ref', ref: EntityRef, raw: string };

export function buildEntityPath(ref: EntityRef): string {
  return `/projects/${ref.projectSlug}/${PATH_SEGMENT[ref.type]}/${ref.id}`;
}

export function buildEntityReference(ref: EntityRef, origin: string): string {
  return `${origin}${buildEntityPath(ref)}`;
}

// Split a message body into text and supported references. `allowedOrigins`
// are the Bunkai origins a pasted absolute URL may carry; a relative path is
// always accepted. Anything else (other hosts, unsupported entities, malformed
// ids) never matches and stays inside a text segment.
export function parseBodySegments(body: string, allowedOrigins: readonly string[]): BodySegment[] {
  const allowed = new Set(allowedOrigins.map(o => o.toLowerCase()));
  const re = buildRefRegex();
  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const m of body.matchAll(re)) {
    const origin = m[1];
    if (origin && !allowed.has(origin.toLowerCase())) { continue; }
    const type = TYPE_BY_SEGMENT[m[4].toLowerCase()];
    if (!type) { continue; }
    const start = m.index ?? 0;
    if (start > cursor) { segments.push({ kind: 'text', text: body.slice(cursor, start) }); }
    segments.push({ kind: 'ref', ref: { type, id: m[5].toLowerCase(), projectSlug: m[3].toLowerCase() }, raw: m[0] });
    cursor = start + m[0].length;
  }
  if (cursor < body.length) { segments.push({ kind: 'text', text: body.slice(cursor) }); }
  return segments;
}

export function refKey(ref: Pick<EntityRef, 'type' | 'id'>): string {
  return `${ref.type}:${ref.id}`;
}

// Distinct references in first-seen order (one resolver call per distinct one).
export function distinctRefs(segments: readonly BodySegment[]): EntityRef[] {
  const seen = new Map<string, EntityRef>();
  for (const s of segments) {
    if (s.kind === 'ref' && !seen.has(refKey(s.ref))) { seen.set(refKey(s.ref), s.ref); }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Status vocabularies — each entity type shows ITS OWN state, never another's.
// ---------------------------------------------------------------------------

export type StatusTone = 'pass' | 'fail' | 'blocked' | 'skipped' | 'running' | 'neutral';

export interface EntityStatus {
  value: string
  label: string
  tone: StatusTone
}

export type RunStatus = 'running' | 'passed' | 'failed' | 'aborted';
export type PositionStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'skipped';
export type AtcExecutionStatus = 'unrun' | 'running' | 'pass' | 'fail' | 'blocked' | 'skipped';
export type AutomationStatus = 'manual-only' | 'candidate' | 'automated';

const RUN_STATUS: Record<RunStatus, EntityStatus> = {
  running: { value: 'running', label: 'Running', tone: 'running' },
  passed: { value: 'passed', label: 'Passed', tone: 'pass' },
  failed: { value: 'failed', label: 'Failed', tone: 'fail' },
  aborted: { value: 'aborted', label: 'Aborted', tone: 'skipped' },
};

// Run-level status only: a `blocked` child position is never promoted here.
export function runStatusOf(status: string): EntityStatus {
  return RUN_STATUS[status as RunStatus] ?? { value: status, label: status, tone: 'neutral' };
}

const ATC_STATUS: Record<AtcExecutionStatus, EntityStatus> = {
  unrun: { value: 'unrun', label: 'Unrun', tone: 'neutral' },
  running: { value: 'running', label: 'Running', tone: 'running' },
  pass: { value: 'pass', label: 'Pass', tone: 'pass' },
  fail: { value: 'fail', label: 'Fail', tone: 'fail' },
  blocked: { value: 'blocked', label: 'Blocked', tone: 'blocked' },
  skipped: { value: 'skipped', label: 'Skipped', tone: 'skipped' },
};

const POSITION_TO_ATC: Record<PositionStatus, AtcExecutionStatus> = {
  pending: 'unrun',
  passed: 'pass',
  failed: 'fail',
  blocked: 'blocked',
  skipped: 'skipped',
};

export interface AtcPosition {
  runId: string
  runStartedAt: string
  runStatus: string
  positionId: string
  position: number
  positionStatus: string
}

// Pick the latest applicable position: newest Run (`started_at DESC`, then
// `id DESC`), then the highest position in it (`position DESC`, then `id DESC`).
export function pickLatestPosition(rows: readonly AtcPosition[]): AtcPosition | null {
  if (rows.length === 0) { return null; }
  const sorted = [...rows].sort((a, b) => {
    const t = Date.parse(b.runStartedAt) - Date.parse(a.runStartedAt);
    if (t !== 0) { return t; }
    if (a.runId !== b.runId) { return a.runId < b.runId ? 1 : -1; }
    if (a.position !== b.position) { return b.position - a.position; }
    return a.positionId < b.positionId ? 1 : a.positionId > b.positionId ? -1 : 0;
  });
  return sorted[0];
}

// ATC Execution Status derived from the latest authorized Run position — the
// stale `atcs.status` column is deliberately not an input.
export function atcExecutionStatus(latest: AtcPosition | null): EntityStatus {
  if (!latest) { return ATC_STATUS.unrun; }
  if (latest.runStatus === 'running') { return ATC_STATUS.running; }
  return ATC_STATUS[POSITION_TO_ATC[latest.positionStatus as PositionStatus] ?? 'unrun'];
}

const AUTOMATION_STATUS: Record<AutomationStatus, EntityStatus> = {
  'manual-only': { value: 'manual-only', label: 'Manual only', tone: 'skipped' },
  'candidate': { value: 'candidate', label: 'Candidate', tone: 'blocked' },
  'automated': { value: 'automated', label: 'Automated', tone: 'pass' },
};

export function automationStatusOf(status: string): EntityStatus {
  return AUTOMATION_STATUS[status as AutomationStatus] ?? AUTOMATION_STATUS['manual-only'];
}

// ---------------------------------------------------------------------------
// Card contract
// ---------------------------------------------------------------------------

export interface ResolvedEntityCard {
  state: 'ok'
  type: EntityType
  id: string
  code: string
  title: string
  status: EntityStatus
  project_name: string
  detail: string | null
  href: string
}

export interface RestrictedEntityCard { state: 'restricted', type: EntityType, id: string }
export interface UnavailableEntityCard { state: 'unavailable', type: EntityType, id: string }
export type InertEntityCard = RestrictedEntityCard | UnavailableEntityCard;

export type EntityCard = ResolvedEntityCard | RestrictedEntityCard | UnavailableEntityCard;

export interface EntitySearchItem {
  type: EntityType
  id: string
  code: string
  title: string
  project_name: string
  project_slug: string
}

const CODE_PREFIX: Record<EntityType, string> = { atc: 'ATC', test: 'T', run: 'RUN' };

// Mono chip id, same short-id idiom the runs/bugs views use (first 8 hex).
export function entityCode(type: EntityType, id: string): string {
  return `${CODE_PREFIX[type]}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = { atc: 'ATC', test: 'Test', run: 'Run' };

// Insert `text` at the caret without replacing adjacent text: a separating
// space is added only when the neighbouring character is not whitespace.
export function insertAtCaret(draft: string, caret: number, text: string): { value: string, caret: number } {
  const at = Math.max(0, Math.min(caret, draft.length));
  const before = draft.slice(0, at);
  const after = draft.slice(at);
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trail = after.length === 0 || !/^\s/.test(after) ? ' ' : '';
  const inserted = `${lead}${text}${trail}`;
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

// Text of a message with its supported references removed (the cards carry
// them), whitespace left by the removal tidied; surrounding words untouched.
export function textWithoutRefs(segments: readonly BodySegment[]): string {
  return segments
    .map(s => (s.kind === 'text' ? s.text : ' '))
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();
}
