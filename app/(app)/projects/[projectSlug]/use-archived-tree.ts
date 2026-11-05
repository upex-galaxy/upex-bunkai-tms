'use client';

import type { Atc, ModuleTreeNode } from '@lib/types';
import { fetchModuleTreeWithArchived } from '@lib/modules/archive-client';
import { buildModuleTree } from '@lib/tree';
import { useCallback, useEffect, useMemo, useState } from 'react';

// BK-601 — the explorer's archived opt-in. Layouts receive no searchParams, so this is
// client state with an on-demand read: per view, nothing persisted, gone with the
// Project (`ProjectShell` keys by slug) and on reload. The live `tree` prop stays what
// it always was; every count, move target and archive confirmation keeps reading it.

type ArchivedRead
  = | { status: 'off' }
    | { status: 'loading' }
    | { status: 'ready', tree: ModuleTreeNode[], anyArchived: boolean }
    | { status: 'error', message: string };

// `node.atcs` already holds every live ATC in the Module (the tree builder buckets
// story-linked ATCs there too). Archived ATCs are not read: that view is BK-571's.
function liveAtcs(nodes: ModuleTreeNode[], acc: Atc[] = []): Atc[] {
  for (const node of nodes) {
    acc.push(...node.atcs);
    liveAtcs(node.children, acc);
  }
  return acc;
}

export function useArchivedTree(projectId: string, liveTree: ModuleTreeNode[], enabled: boolean) {
  const [read, setRead] = useState<ArchivedRead>({ status: 'off' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setRead({ status: 'off' });
      return;
    }
    let cancelled = false;
    // A refresh keeps the rows on screen until the new ones land.
    setRead(previous => (previous.status === 'ready' ? previous : { status: 'loading' }));
    void fetchModuleTreeWithArchived(projectId).then((result) => {
      if (cancelled) { return; }
      if (!result.ok) {
        setRead({ status: 'error', message: result.errorMessage });
        return;
      }
      const { modules, user_stories: stories, acceptance_criteria: acceptanceCriteria } = result.listing;
      setRead({
        status: 'ready',
        tree: buildModuleTree({ modules, stories, acceptanceCriteria, atcs: liveAtcs(liveTree) }),
        anyArchived: modules.some(m => m.archived_at !== null)
          || stories.some(s => s.archived_at !== null)
          || acceptanceCriteria.some(c => c.archived_at !== null),
      });
    });
    return () => { cancelled = true; };
  }, [projectId, liveTree, enabled, attempt]);

  const reload = useCallback(() => { setAttempt(n => n + 1); }, []);

  const tree = useMemo(() => (read.status === 'ready' ? read.tree : liveTree), [read, liveTree]);

  return { read, tree, reload };
}
