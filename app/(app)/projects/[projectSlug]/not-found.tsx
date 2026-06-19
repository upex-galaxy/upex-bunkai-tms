'use client';

import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Segment-level not-found (BK-147). A deleted or invisible ATC/Test deep-link
// makes its detail route call notFound(); Next renders this boundary INSIDE the
// project layout, so the safe state shows within the persistent shell (explorer
// + navigation stay visible) instead of a broken full page. not-found.tsx does
// not receive params, so the project slug is read from the pathname for the
// back link.
export default function ProjectItemNotFound() {
  const pathname = usePathname();
  const slug = pathname.split('/')[2] ?? '';
  const projectHref = slug ? `/projects/${slug}` : '/projects';

  return (
    <div
      data-testid="workbench-not-found"
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <FileQuestion size={28} className="text-fg-4" />
      <div className="text-sm font-medium text-fg-1">This item is no longer available</div>
      <p className="max-w-sm text-xs leading-relaxed text-fg-3">
        It may have been deleted, or you don’t have access to it. The rest of the project is still
        here.
      </p>
      <Link
        href={projectHref}
        className="mt-1 inline-flex items-center rounded-2 border border-stroke-2 bg-surface-2 px-3 py-1.5 text-xs text-fg-1 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
      >
        Back to project
      </Link>
    </div>
  );
}
