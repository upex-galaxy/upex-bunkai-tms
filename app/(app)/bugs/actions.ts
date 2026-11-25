'use server';

import { revalidatePath } from 'next/cache';

// BK-2484 — a defect is filed through the API, and a client navigation keeps the cached (app) layout that holds the sidebar's Bug Reports count.
export async function revalidateAfterBugFiled(): Promise<void> {
  revalidatePath('/', 'layout');
}
