'use server';

import { revalidatePath } from 'next/cache';

// BK-571 — archive and restore go through the API, so nothing tells the router's
// cache. A plain router.refresh() is not enough: the Project layout holds the tree
// and the ATC table, a navigation discards a pending refresh, and the workbench's
// address writer can discard one too. Revalidating here drops the cached layouts
// (tree, table, the sidebar's ATC count) before the caller navigates. The action
// reads and writes nothing; every data read behind it stays RLS-scoped.
export async function revalidateAfterArchiveChange(): Promise<void> {
  revalidatePath('/', 'layout');
}
