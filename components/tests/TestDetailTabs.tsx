'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// BK-37 — the Test-detail tab strip, hosted by `tests/[testId]/layout.tsx` so it
// stays mounted across both tabs. Tabs are ROUTES, not client-side panels: the
// active tab and (on Run History) the outcome filter live in the URL, which
// makes both deep-linkable and directly assertable by QA.
//
// Only two tabs ship. The mockup's third ("Overview") is deliberately omitted —
// the live page has no Overview content to route to, and an empty tab is worse
// UX than two honest ones (plan §3.3).
//
// Anatomy follows the mockup's `.tabs` nav (raised tab boxes, rounded top
// corners, pulled 1px down over the strip's bottom border) but every value comes
// from the LIVE design system's tokens (Critical Rule #14).

interface TestDetailTabsProps {
  projectSlug: string
  testId: string
}

export function TestDetailTabs({ projectSlug, testId }: TestDetailTabsProps) {
  const pathname = usePathname();
  const stepsHref = `/projects/${projectSlug}/tests/${testId}`;
  const runsHref = `${stepsHref}/runs`;

  // Anything under `/runs` is the Run History tab; everything else on the Test
  // (the index route) is Steps, so the strip never renders with no active tab.
  const onRuns = pathname === runsHref || pathname.startsWith(`${runsHref}/`);

  const tabs = [
    { label: 'Steps', href: stepsHref, active: !onRuns, testId: 'test-tab-steps' },
    { label: 'Run History', href: runsHref, active: onRuns, testId: 'test-tab-runs' },
  ];

  return (
    <nav
      aria-label="Test sections"
      data-testid="test-tabs"
      className="flex flex-shrink-0 items-end border-b border-stroke-2 px-4"
    >
      <div className="mx-auto flex w-full max-w-[820px] items-end gap-1">
        {tabs.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            data-testid={tab.testId}
            aria-current={tab.active ? 'page' : undefined}
            className={`-mb-px inline-flex items-center rounded-t-2 border px-2.5 py-1.5 text-sm font-medium tracking-[0.02em] transition-colors duration-token ease-token ${
              tab.active
                ? 'border-stroke-2 border-b-surface-2 bg-surface-2 text-fg-0'
                : 'border-transparent text-fg-2 hover:bg-surface-3 hover:text-fg-1'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
