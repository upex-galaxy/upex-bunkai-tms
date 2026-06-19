'use client';

import { AtcTable } from '@components/atcs/AtcTable';
import { MindMapView } from './mind-map-view';
import { useWorkbench } from './workbench-context';

// Project workbench INDEX — the no-tab state of the route-driven workbench
// (BK-147). The persistent explorer, toolbar and tab bar live in the layout
// (`project-shell.tsx`); this only renders the main-area browse view for the
// current toggle. Opening an ATC or Test navigates to its own route, which
// renders into the shell's content slot instead of this page.
export default function ProjectIndexPage() {
  const { view, rows, tree, projectSlug } = useWorkbench();

  if (view === 'table') {
    return <AtcTable atcs={rows} projectSlug={projectSlug} />;
  }

  if (view === 'mindmap') {
    return <MindMapView tree={tree} projectSlug={projectSlug} />;
  }

  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-4">
      Select an ATC or Test from the explorer to open it here.
    </div>
  );
}
