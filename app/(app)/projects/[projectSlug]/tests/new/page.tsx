import type { AtcLibraryItem } from '@components/tests/AtcChainPicker';
import { NewTestBuilder } from '@components/tests/NewTestBuilder';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

export default async function NewTestPage({ params }: PageProps) {
  const { projectSlug } = await params;
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

  // Tests are WORKSPACE-scoped while ATCs are project-scoped (Decision 2), so
  // the library spans every non-archived ATC across ALL the workspace's
  // projects — not just the project the builder was opened from. Selectable =
  // every non-archived workspace ATC (no "published" state exists).
  const { data: projectRows } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', activeWorkspaceId);
  const projectIds = (projectRows ?? []).map(p => p.id);

  const { data: atcRows } = projectIds.length > 0
    ? await supabase
        .from('atcs')
        .select('id, slug, title, layer')
        .in('project_id', projectIds)
        .is('archived_at', null)
        .order('slug', { ascending: true })
    : { data: [] };

  const atcs = (atcRows ?? []) as AtcLibraryItem[];

  return <NewTestBuilder projectSlug={project.slug} atcs={atcs} />;
}
