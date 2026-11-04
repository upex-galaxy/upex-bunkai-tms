import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveActivityActors } from '@lib/supabase/rpc';
import { shortSlug } from '@lib/utils';

// BK-439 — workspace-wide ATC Library read. Everything goes through the
// caller's RLS-scoped client, so an ATC in a workspace the caller is not an
// active member of can never appear in the rows or in the badge count
// (`atcs_select_workspace_member`). Pages are drained in a loop: Supabase caps
// a single response at ~1000 rows and the Library must not silently truncate.

export const ATC_LIBRARY_PAGE_SIZE = 1000;

export interface AtcLibraryRow {
  id: string
  slug: string
  code: string
  title: string
  layer: string
  projectName: string
  projectSlug: string
  moduleName: string
  storyLabel: string
  acLabel: string | null
  usedInTests: number
}

export type AtcLibraryViewState = 'list' | 'empty';

export function resolveAtcLibraryViewState(rowCount: number): AtcLibraryViewState {
  return rowCount === 0 ? 'empty' : 'list';
}

interface RawAtc {
  id: string
  slug: string
  title: string
  layer: string
  projects: { name: string, slug: string } | null
  modules: { name: string } | null
  user_stories: { external_id: string | null, title: string } | null
  atc_acceptance_criteria: {
    acceptance_criteria: { title: string, position: number, archived_at: string | null } | null
  }[] | null
}

export function buildAtcLibraryRows(
  atcs: RawAtc[],
  usage: ReadonlyMap<string, number>,
): AtcLibraryRow[] {
  const rows = atcs.map((atc): AtcLibraryRow => {
    const criteria = (atc.atc_acceptance_criteria ?? [])
      .map(link => link.acceptance_criteria)
      .filter((ac): ac is NonNullable<typeof ac> => ac !== null && ac.archived_at === null)
      .sort((a, b) => a.position - b.position);
    const extra = criteria.length - 1;
    return {
      id: atc.id,
      slug: atc.slug,
      code: shortSlug(atc.slug),
      title: atc.title,
      layer: atc.layer,
      projectName: atc.projects?.name ?? '—',
      projectSlug: atc.projects?.slug ?? '',
      moduleName: atc.modules?.name ?? '—',
      storyLabel: atc.user_stories?.external_id ?? atc.user_stories?.title ?? '—',
      acLabel: criteria.length === 0 ? null : `${criteria[0].title}${extra > 0 ? ` +${extra}` : ''}`,
      usedInTests: usage.get(atc.id) ?? 0,
    };
  });
  // Deterministic default order: owning Project, then ATC code (BK-439 AI
  // Product Owner decision — the grouping a "does it exist already" scan wants).
  return rows.sort((a, b) =>
    a.projectName.localeCompare(b.projectName) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id),
  );
}

// Count of DISTINCT Tests chaining each ATC, from raw test_steps rows.
export function countDistinctTestsPerAtc(
  steps: { atc_id: string, test_id: string }[],
): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const step of steps) {
    const set = seen.get(step.atc_id) ?? new Set<string>();
    set.add(step.test_id);
    seen.set(step.atc_id, set);
  }
  return new Map([...seen].map(([atcId, tests]) => [atcId, tests.size]));
}

async function drainPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += ATC_LIBRARY_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + ATC_LIBRARY_PAGE_SIZE - 1);
    if (error) { throw new Error(error.message); }
    const page = data ?? [];
    all.push(...page);
    if (page.length < ATC_LIBRARY_PAGE_SIZE) { return all; }
  }
}

export async function fetchAtcLibrary(
  db: SupabaseClient<Database>,
  workspaceId: string,
): Promise<AtcLibraryRow[]> {
  const [atcs, steps] = await Promise.all([
    drainPages<RawAtc>(async (from, to) => {
      const res = await db
        .from('atcs')
        .select('id, slug, title, layer, projects!inner(name, slug, workspace_id), modules(name), user_stories(external_id, title), atc_acceptance_criteria(acceptance_criteria(title, position, archived_at))')
        .eq('projects.workspace_id', workspaceId)
        .is('archived_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      return { data: res.data as unknown as RawAtc[] | null, error: res.error };
    }),
    drainPages<{ atc_id: string, test_id: string }>(async (from, to) => {
      const res = await db
        .from('test_steps')
        .select('atc_id, test_id, tests!inner(workspace_id)')
        .eq('tests.workspace_id', workspaceId)
        .order('id', { ascending: true })
        .range(from, to);
      return { data: res.data as unknown as { atc_id: string, test_id: string }[] | null, error: res.error };
    }),
  ]);
  return buildAtcLibraryRows(atcs, countDistinctTestsPerAtc(steps));
}

// Unfiltered badge count — every readable, non-archived ATC in the workspace.
// Returns null on a failed read so the sidebar hides the badge rather than
// showing a misleading 0.
export async function countAtcsInWorkspace(
  db: SupabaseClient<Database>,
  workspaceId: string,
): Promise<number | null> {
  const { count, error } = await db
    .from('atcs')
    .select('id, projects!inner(workspace_id)', { count: 'exact', head: true })
    .eq('projects.workspace_id', workspaceId)
    .is('archived_at', null);
  return error ? null : (count ?? 0);
}

// ---------------------------------------------------------------------------
// BK-571 — the archived view of the Library. An ATC archived on its own is
// listed; one that a Module or User Story cascade archived is not, because it
// comes back when that parent is restored (the contract in migration 0116).

export const ARCHIVED_ACTOR_UNKNOWN = 'Unknown';

// Where an archived ATC's `archived_at` came from. Cascades stamp ONE timestamp
// across the subtree, so equality with a parent's means "the parent did this".
// Compared as the raw strings the database returned: a `Date` would drop the
// microseconds and make two different instants look equal.
export type ArchivedAtcSource = 'own' | 'module' | 'user_story';

export interface ArchivedAtcStamps {
  atcArchivedAt: string
  moduleArchivedAt: string | null
  storyArchivedAt: string | null
}

export function archivedAtcSource({ atcArchivedAt, moduleArchivedAt, storyArchivedAt }: ArchivedAtcStamps): ArchivedAtcSource {
  if (atcArchivedAt === moduleArchivedAt) { return 'module'; }
  if (atcArchivedAt === storyArchivedAt) { return 'user_story'; }
  return 'own';
}

export function isArchivedOnOwn(stamps: ArchivedAtcStamps): boolean {
  return archivedAtcSource(stamps) === 'own';
}

export interface ArchivedParents {
  moduleName: string | null
  moduleArchivedAt: string | null
  storyLabel: string | null
  storyArchivedAt: string | null
  archivedCriteriaTitles: string[]
}

// One line per archived thing the ATC hangs from, so the reader sees why the
// anchor cannot be edited back to life from here.
export function archivedParentNotes(parents: ArchivedParents): string[] {
  const notes: string[] = [];
  if (parents.moduleArchivedAt !== null) { notes.push(`Module "${parents.moduleName ?? '—'}" is archived.`); }
  if (parents.storyArchivedAt !== null) { notes.push(`User Story "${parents.storyLabel ?? '—'}" is archived.`); }
  for (const title of parents.archivedCriteriaTitles) { notes.push(`Acceptance Criterion "${title}" is archived.`); }
  return notes;
}

export interface AtcArchivedRow {
  id: string
  slug: string
  code: string
  title: string
  layer: string
  projectName: string
  projectSlug: string
  moduleName: string
  storyLabel: string
  acLabel: string | null
  archivedAt: string
  archivedByLabel: string
  notes: string[]
}

interface RawArchivedAtc {
  id: string
  slug: string
  title: string
  layer: string
  archived_at: string
  archived_by: string | null
  projects: { name: string, slug: string } | null
  modules: { name: string, archived_at: string | null } | null
  user_stories: { external_id: string | null, title: string, archived_at: string | null } | null
  atc_acceptance_criteria: {
    acceptance_criteria: { title: string, position: number, archived_at: string | null } | null
  }[] | null
}

// Keeps only the ATCs archived on their own, newest archive first. `actorEmails`
// maps a user id to the email the actor resolver returned; an id with no entry
// (or a null `archived_by`) reads `Unknown`, never a raw id and never a throw.
export function buildArchivedAtcRows(
  atcs: RawArchivedAtc[],
  actorEmails: ReadonlyMap<string, string | null>,
): AtcArchivedRow[] {
  const rows = atcs
    .filter(atc => isArchivedOnOwn({
      atcArchivedAt: atc.archived_at,
      moduleArchivedAt: atc.modules?.archived_at ?? null,
      storyArchivedAt: atc.user_stories?.archived_at ?? null,
    }))
    .map((atc): AtcArchivedRow => {
      const criteria = (atc.atc_acceptance_criteria ?? [])
        .map(link => link.acceptance_criteria)
        .filter((ac): ac is NonNullable<typeof ac> => ac !== null)
        .sort((a, b) => a.position - b.position);
      const extra = criteria.length - 1;
      const storyLabel = atc.user_stories?.external_id ?? atc.user_stories?.title ?? '—';
      return {
        id: atc.id,
        slug: atc.slug,
        code: shortSlug(atc.slug),
        title: atc.title,
        layer: atc.layer,
        projectName: atc.projects?.name ?? '—',
        projectSlug: atc.projects?.slug ?? '',
        moduleName: atc.modules?.name ?? '—',
        storyLabel,
        acLabel: criteria.length === 0 ? null : `${criteria[0].title}${extra > 0 ? ` +${extra}` : ''}`,
        archivedAt: atc.archived_at,
        archivedByLabel: (atc.archived_by === null ? null : actorEmails.get(atc.archived_by)) ?? ARCHIVED_ACTOR_UNKNOWN,
        notes: archivedParentNotes({
          moduleName: atc.modules?.name ?? null,
          moduleArchivedAt: atc.modules?.archived_at ?? null,
          storyLabel,
          storyArchivedAt: atc.user_stories?.archived_at ?? null,
          archivedCriteriaTitles: criteria.filter(ac => ac.archived_at !== null).map(ac => ac.title),
        }),
      };
    });
  return rows.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt) || a.id.localeCompare(b.id));
}

// Resolves archiving actors to emails through the existing batch resolver. A
// failed or partial resolution is not an error for the page: those actors read
// `Unknown`.
export async function resolveArchiveActors(
  db: SupabaseClient<Database>,
  workspaceId: string,
  userIds: readonly (string | null)[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) { return new Map(); }
  const { data, error } = await resolveActivityActors(db, { workspaceId, userIds: ids });
  if (error) { return new Map(); }
  return new Map(((data ?? []) as { user_id: string, email: string | null }[]).map(actor => [actor.user_id, actor.email]));
}

export async function fetchArchivedAtcs(
  db: SupabaseClient<Database>,
  workspaceId: string,
): Promise<AtcArchivedRow[]> {
  const atcs = await drainPages<RawArchivedAtc>(async (from, to) => {
    const res = await db
      .from('atcs')
      .select('id, slug, title, layer, archived_at, archived_by, projects!inner(name, slug, workspace_id), modules(name, archived_at), user_stories(external_id, title, archived_at), atc_acceptance_criteria(acceptance_criteria(title, position, archived_at))')
      .eq('projects.workspace_id', workspaceId)
      .not('archived_at', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    return { data: res.data as unknown as RawArchivedAtc[] | null, error: res.error };
  });
  const actors = await resolveArchiveActors(db, workspaceId, atcs.map(atc => atc.archived_by));
  return buildArchivedAtcRows(atcs, actors);
}
