import type {
  AtcPosition,
  EntityCard,
  EntityRef,
  EntitySearchItem,
  EntityType,
} from '@lib/chat/entity-refs';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import {
  atcExecutionStatus,
  automationStatusOf,
  buildEntityPath,
  entityCode,
  MAX_REFS_PER_RESOLVE,
  pickLatestPosition,
  runStatusOf,
  UUID_RE,
} from '@lib/chat/entity-refs';
import { resolveGeneralChannelId } from './response';

// BK-218 — DB-parametrized logic for the rich entity link routes
// (`POST .../chat/entities/resolve`, `GET .../chat/entities/search`). Same
// split as ./response.ts: every branch is unit-testable with a fake `db`.
//
// Authorization model. Everything runs on the CALLER'S RLS-scoped client, and
// Bunkai project access is workspace membership (every `*_select_workspace_member`
// policy). The channel's workspace W is the trust boundary:
//   * caller must be an active member of W (the channel lookup 404s otherwise);
//   * an entity RLS lets the caller read but that lives in ANOTHER workspace is
//     answered `restricted` — no title, id, project or state is returned;
//   * an entity RLS hides, or that does not exist / is archived, is
//     `unavailable`, so there is no existence oracle across workspaces.

export const SEARCH_PER_TYPE = 5;

interface ProjectLite { id: string, name: string, slug: string, workspace_id: string }

function inert(ref: Pick<EntityRef, 'type' | 'id'>, state: 'restricted' | 'unavailable'): EntityCard {
  return { state, type: ref.type, id: ref.id };
}

function fail(message: string): never {
  throw new ApiError('internal_error', message);
}

async function fetchProjects(db: SupabaseClient<Database>, filter: { ids?: string[], workspaceId?: string }): Promise<Map<string, ProjectLite>> {
  let q = db.from('projects').select('id, name, slug, workspace_id');
  if (filter.ids) { q = q.in('id', filter.ids); }
  if (filter.workspaceId) { q = q.eq('workspace_id', filter.workspaceId); }
  const { data, error } = await q;
  if (error) { fail(error.message); }
  return new Map((data ?? []).map(p => [p.id, p as ProjectLite]));
}

export function parseResolveBody(json: unknown): EntityRef[] {
  const raw = typeof json === 'object' && json !== null ? (json as { refs?: unknown }).refs : undefined;
  if (!Array.isArray(raw)) { throw new ApiError('validation_failed', '`refs` must be an array.'); }
  if (raw.length > MAX_REFS_PER_RESOLVE) {
    throw new ApiError('validation_failed', `At most ${MAX_REFS_PER_RESOLVE} references per request.`);
  }
  const refs: EntityRef[] = [];
  for (const item of raw) {
    const r = item as { type?: unknown, id?: unknown, project_slug?: unknown };
    if ((r.type !== 'atc' && r.type !== 'test' && r.type !== 'run') || typeof r.id !== 'string' || !UUID_RE.test(r.id)
      || typeof r.project_slug !== 'string' || r.project_slug.length === 0 || r.project_slug.length > 100) {
      throw new ApiError('validation_failed', 'Each reference needs a valid `type`, `id` and `project_slug`.');
    }
    refs.push({ type: r.type, id: r.id.toLowerCase(), projectSlug: r.project_slug.toLowerCase() });
  }
  return refs;
}

async function resolveRuns(db: SupabaseClient<Database>, workspaceId: string, refs: EntityRef[]): Promise<Map<string, EntityCard>> {
  const out = new Map<string, EntityCard>();
  if (refs.length === 0) { return out; }
  const { data, error } = await db
    .from('runs')
    .select('id, workspace_id, project_id, environment_id, status, test_title')
    .in('id', refs.map(r => r.id));
  if (error) { fail(error.message); }
  const rows = data ?? [];
  const inWorkspace = rows.filter(r => r.workspace_id === workspaceId);
  const projects = await fetchProjects(db, { ids: [...new Set(inWorkspace.map(r => r.project_id))] });
  const envIds = [...new Set(inWorkspace.map(r => r.environment_id))];
  const envNames = new Map<string, string>();
  if (envIds.length > 0) {
    const { data: envs, error: envError } = await db.from('project_environments').select('id, name').in('id', envIds);
    if (envError) { fail(envError.message); }
    for (const e of envs ?? []) { envNames.set(e.id, e.name); }
  }
  for (const ref of refs) {
    const row = rows.find(r => r.id === ref.id);
    if (!row) { out.set(ref.id, inert(ref, 'unavailable')); continue; }
    if (row.workspace_id !== workspaceId) { out.set(ref.id, inert(ref, 'restricted')); continue; }
    const project = projects.get(row.project_id);
    if (!project) { out.set(ref.id, inert(ref, 'unavailable')); continue; }
    out.set(ref.id, {
      state: 'ok',
      type: 'run',
      id: row.id,
      code: entityCode('run', row.id),
      title: row.test_title,
      status: runStatusOf(row.status),
      project_name: project.name,
      detail: envNames.get(row.environment_id) ?? null,
      href: buildEntityPath({ type: 'run', id: row.id, projectSlug: project.slug }),
    });
  }
  return out;
}

async function resolveTests(db: SupabaseClient<Database>, workspaceId: string, refs: EntityRef[]): Promise<Map<string, EntityCard>> {
  const out = new Map<string, EntityCard>();
  if (refs.length === 0) { return out; }
  const { data, error } = await db
    .from('tests')
    .select('id, workspace_id, title, automation_status')
    .in('id', refs.map(r => r.id));
  if (error) { fail(error.message); }
  const rows = data ?? [];
  // Tests are workspace-scoped (no project column), so the reference carries
  // its Project context in the URL. It is validated server-side: the slug must
  // name a project of THIS workspace; missing / unknown context never resolves.
  const projects = [...(await fetchProjects(db, { workspaceId })).values()];
  for (const ref of refs) {
    const row = rows.find(r => r.id === ref.id);
    if (!row) { out.set(ref.id, inert(ref, 'unavailable')); continue; }
    if (row.workspace_id !== workspaceId) { out.set(ref.id, inert(ref, 'restricted')); continue; }
    const project = projects.find(p => p.slug === ref.projectSlug);
    if (!project) { out.set(ref.id, inert(ref, 'unavailable')); continue; }
    out.set(ref.id, {
      state: 'ok',
      type: 'test',
      id: row.id,
      code: entityCode('test', row.id),
      title: row.title,
      status: automationStatusOf(row.automation_status),
      project_name: project.name,
      detail: null,
      href: buildEntityPath({ type: 'test', id: row.id, projectSlug: project.slug }),
    });
  }
  return out;
}

async function latestAtcPosition(db: SupabaseClient<Database>, atcId: string): Promise<AtcPosition | null> {
  const { data, error } = await db
    .from('run_atcs')
    .select('id, position, status, runs!inner(id, started_at, status)')
    .eq('atc_id', atcId)
    .limit(500);
  if (error) { fail(error.message); }
  const rows: AtcPosition[] = [];
  for (const r of data ?? []) {
    const run = Array.isArray(r.runs) ? r.runs[0] : r.runs;
    if (!run) { continue; }
    rows.push({
      runId: run.id,
      runStartedAt: run.started_at,
      runStatus: run.status,
      positionId: r.id,
      position: r.position,
      positionStatus: r.status,
    });
  }
  return pickLatestPosition(rows);
}

async function resolveAtcs(db: SupabaseClient<Database>, workspaceId: string, refs: EntityRef[]): Promise<Map<string, EntityCard>> {
  const out = new Map<string, EntityCard>();
  if (refs.length === 0) { return out; }
  const { data, error } = await db
    .from('atcs')
    .select('id, project_id, title, layer, archived_at')
    .in('id', refs.map(r => r.id));
  if (error) { fail(error.message); }
  const rows = data ?? [];
  const projects = await fetchProjects(db, { ids: [...new Set(rows.map(r => r.project_id))] });
  for (const ref of refs) {
    const row = rows.find(r => r.id === ref.id);
    const project = row ? projects.get(row.project_id) : undefined;
    if (!row || !project) { out.set(ref.id, inert(ref, 'unavailable')); continue; }
    if (project.workspace_id !== workspaceId) { out.set(ref.id, inert(ref, 'restricted')); continue; }
    if (row.archived_at) { out.set(ref.id, inert(ref, 'unavailable')); continue; }
    const latest = await latestAtcPosition(db, row.id);
    out.set(ref.id, {
      state: 'ok',
      type: 'atc',
      id: row.id,
      code: entityCode('atc', row.id),
      title: row.title,
      status: atcExecutionStatus(latest),
      project_name: project.name,
      detail: `${row.layer} layer`,
      href: buildEntityPath({ type: 'atc', id: row.id, projectSlug: project.slug }),
    });
  }
  return out;
}

export async function resolveEntityCards(
  db: SupabaseClient<Database>,
  params: { workspaceId: string, refs: EntityRef[] },
): Promise<{ cards: Record<string, EntityCard> }> {
  await resolveGeneralChannelId(db, params.workspaceId);
  const distinct = new Map<string, EntityRef>();
  for (const r of params.refs) { distinct.set(`${r.type}:${r.id}`, r); }
  const byType = (t: EntityType) => [...distinct.values()].filter(r => r.type === t);
  const [atcs, tests, runs] = await Promise.all([
    resolveAtcs(db, params.workspaceId, byType('atc')),
    resolveTests(db, params.workspaceId, byType('test')),
    resolveRuns(db, params.workspaceId, byType('run')),
  ]);
  const cards: Record<string, EntityCard> = {};
  for (const [type, map] of [['atc', atcs], ['test', tests], ['run', runs]] as const) {
    for (const [id, card] of map) { cards[`${type}:${id}`] = card; }
  }
  return { cards };
}

// Strip characters that carry meaning in PostgREST filters / ILIKE patterns.
export function sanitizeSearchTerm(raw: string | null): string {
  return (raw ?? '').replace(/[%_,()*\\]/g, ' ').trim().slice(0, 80);
}

export async function searchEntities(
  db: SupabaseClient<Database>,
  params: { workspaceId: string, q: string },
): Promise<{ items: EntitySearchItem[] }> {
  await resolveGeneralChannelId(db, params.workspaceId);
  const projects = await fetchProjects(db, { workspaceId: params.workspaceId });
  const projectIds = [...projects.keys()];
  const term = params.q;
  const pattern = `%${term}%`;
  const isUuid = UUID_RE.test(term);
  const items: EntitySearchItem[] = [];

  if (projectIds.length > 0) {
    let aq = db.from('atcs').select('id, project_id, title').in('project_id', projectIds).is('archived_at', null);
    if (term) { aq = isUuid ? aq.eq('id', term.toLowerCase()) : aq.or(`title.ilike.${pattern},slug.ilike.${pattern}`); }
    const { data, error } = await aq.order('updated_at', { ascending: false }).limit(SEARCH_PER_TYPE);
    if (error) { fail(error.message); }
    for (const a of data ?? []) {
      const p = projects.get(a.project_id);
      if (p) { items.push({ type: 'atc', id: a.id, code: entityCode('atc', a.id), title: a.title, project_name: p.name, project_slug: p.slug }); }
    }
  }

  // A Test reference needs a Project context in its URL; use the first project
  // (oldest-by-name order is irrelevant — any project of the workspace resolves).
  const anyProject = [...projects.values()][0];
  if (anyProject) {
    let tq = db.from('tests').select('id, title').eq('workspace_id', params.workspaceId);
    if (term) { tq = isUuid ? tq.eq('id', term.toLowerCase()) : tq.ilike('title', pattern); }
    const { data, error } = await tq.order('updated_at', { ascending: false }).limit(SEARCH_PER_TYPE);
    if (error) { fail(error.message); }
    for (const t of data ?? []) {
      items.push({ type: 'test', id: t.id, code: entityCode('test', t.id), title: t.title, project_name: anyProject.name, project_slug: anyProject.slug });
    }
  }

  let rq = db.from('runs').select('id, project_id, test_title, environment_id').eq('workspace_id', params.workspaceId);
  if (term) { rq = isUuid ? rq.eq('id', term.toLowerCase()) : rq.ilike('test_title', pattern); }
  const { data: runs, error: runError } = await rq.order('started_at', { ascending: false }).limit(SEARCH_PER_TYPE);
  if (runError) { fail(runError.message); }
  for (const r of runs ?? []) {
    const p = projects.get(r.project_id);
    if (p) { items.push({ type: 'run', id: r.id, code: entityCode('run', r.id), title: r.test_title, project_name: p.name, project_slug: p.slug }); }
  }
  return { items };
}
