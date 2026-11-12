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

// BK-507 — the bulk edit goes through the API too, so the same reasoning applies:
// a plain router.refresh() would not drop the cached Project layout that holds the
// tree and the ATC table (versions, tags, Modules). Called after a write attempt
// and after one whose answer was lost, because that write may have happened.
export async function revalidateAfterAtcBulkEdit(): Promise<void> {
  revalidatePath('/', 'layout');
}
