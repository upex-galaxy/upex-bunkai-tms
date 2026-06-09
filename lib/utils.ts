import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ATC slugs are generated path-like (e.g. `module-a/submodule/atc-9f3a`). The
// module context is already shown by the row/column the slug sits in, so the
// path prefix is redundant noise — display only the final segment as the code.
export function shortSlug(slug: string): string {
  const i = slug.lastIndexOf('/');
  return i >= 0 ? slug.slice(i + 1) : slug;
}
