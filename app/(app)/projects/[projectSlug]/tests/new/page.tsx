import type { AtcLibraryItem } from '@components/tests/AtcChainPicker';
import { NewTestBuilder } from '@components/tests/NewTestBuilder';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { duplicatePrefill, duplicateSourceId } from '@lib/tests/duplicate';
import { loadTestDetail } from '@lib/tests/load-test-detail';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function NewTestPage({ params, searchParams }: PageProps) {
  const { projectSlug } = await params;
  const sourceId = duplicateSourceId((await searchParams).from);
  const supabase = await createClient();

  // Project slugs are only unique PER WORKSPACE (BK-52), so the lookup must be
  // scoped to the caller's active workspace — RLS alone would happily match a
  // same-slug project from another workspace the caller belongs to.
  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id')
    .order('created_at', { ascending: true });
  const cookieStore = await cookies();
  const cookieActive = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const activeWorkspaceId = resolveActiveWorkspaceId(
    cookieActive,
    (workspaceRows ?? []).map(w => w.id),
  );
  if (!activeWorkspaceId) { notFound(); }

  const { data: project } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('workspace_id', activeWorkspaceId)
    .eq('slug', projectSlug)
    .limit(1)
    .maybeSingle();

  if (!project) { notFound(); }

  // BK-620 — the library offers only THIS Project's non-archived ATCs. A Test
  // belongs to the Project its whole chain is in (0076's ALL-match rule), so a
  // chain built from another Project's ATCs would be listed in neither
  // Project's Explorer. Supersedes BK-27 Decision 2 for the UI picker (AI
  // Product Owner decision on BK-620); the headless API stays workspace-scoped.
  const { data: atcRows } = await supabase
    .from('atcs')
    .select('id, slug, title, layer')
    .eq('project_id', project.id)
    .is('archived_at', null)
    .order('slug', { ascending: true });

  const atcs = (atcRows ?? []) as AtcLibraryItem[];

  const prefill = sourceId === null
    ? null
    : duplicatePrefill((await loadTestDetail(project.slug, sourceId)).test);

  return <NewTestBuilder key={sourceId ?? 'blank'} projectSlug={project.slug} atcs={atcs} prefill={prefill} />;
}
