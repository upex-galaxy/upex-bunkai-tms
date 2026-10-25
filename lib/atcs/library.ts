import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
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
