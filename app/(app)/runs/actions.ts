'use server';

import { revalidatePath } from 'next/cache';

// BK-2446 — a Run starts through the API, so nothing tells the router's cache, and
// the shared app layout that holds the sidebar's Test Runs count is not re-rendered
// on a client navigation. Revalidating drops it before the caller navigates.
export async function revalidateAfterRunStart(): Promise<void> {
  revalidatePath('/', 'layout');
}
