import type { ReactNode } from 'react';

interface WelcomeBannerProps {
  displayName: string | null
  workspaceName: string | null
  // The "what changed recently" line. Passed as a slot so the
  // page can stream it inside its own <Suspense> boundary: the greeting and
  // the workspace name (AC1) must paint immediately and must never be blocked
  // — or blanked — by the three counting queries behind the summary (AC2/AC3).
  children: ReactNode
}

// BK-255 — the Home greeting header (master-design-plan §4.2, `home.jsx`'s
// greeting block).
//
// Two deliberate departures from the mockup, both recorded in §5 D20:
//   * The "SPRINT 24-Q2 · DAY 7 / 10" eyebrow is not built. No Sprint or
//     iteration entity exists in this product; striking it was ratified via
//     proposal P-2026-08-02-03 (see the story's Out Of Scope field).
//   * The workspace name takes the eyebrow's place. The mockup put it in a
//     global topbar this app does not have, and AC1 requires the member to see
//     which workspace they are in from Home. It reuses the live app's own
//     section-label treatment (mono / uppercase / accent), which is already the
//     ported form of the mockup's eyebrow styling — no new tokens.
//
// The mockup's right-hand header actions (Sync / Filter / Start run) are not
// built here: none of them has a story, and inventing them would put dead
// controls on the product's landing screen.
export function WelcomeBanner({ displayName, workspaceName, children }: WelcomeBannerProps) {
  return (
    <header data-testid="home-welcome-banner" className="flex flex-col">
      {workspaceName !== null && (
        <div
          data-testid="home-welcome-workspace"
          className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent"
        >
          {workspaceName}
        </div>
      )}
      <h1
        data-testid="home-welcome-greeting"
        className="text-2xl font-bold tracking-tight text-fg-0"
      >
        {/* No name resolvable (no OAuth metadata, and an email local-part with
            no letters in it) — greet without one rather than print a raw
            address or a placeholder that reads like a real name. */}
        {displayName === null ? 'Welcome back.' : `Welcome back, ${displayName}.`}
      </h1>
      {children}
    </header>
  );
}

// The summary line's own shell, so the page, the skeleton and the error state
// all agree on its typography and spacing instead of repeating the classes.
export function WelcomeSummaryLine({ children }: { children: ReactNode }) {
  return (
    <p data-testid="home-welcome-summary" className="mt-1 text-sm text-fg-2">
      {children}
    </p>
  );
}

// Suspense fallback for the summary slot. Same `animate-status-pulse` bar the
// activity and run-history skeletons already use, sized to one line of copy so
// the greeting above it does not shift when the real text arrives.
export function WelcomeSummarySkeleton() {
  return (
    <div data-testid="home-welcome-summary-skeleton" className="mt-2 pb-0.5" aria-hidden="true">
      <div className="h-3 w-full max-w-[26rem] animate-status-pulse rounded-1 bg-surface-3" />
    </div>
  );
}
