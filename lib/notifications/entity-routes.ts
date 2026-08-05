// BK-209 (Slice 3: UI) — entity deep-link resolution for a notification row
// (Dev Answer, comments.md 2026-07-16: "Run: /projects/{projectSlug}/runs/
// {runId}. Test: /projects/{projectSlug}/tests/{testId}. Bug: route depends
// on the BK-31 Bugs & Defect Heatmap implementation; Dev must define the
// final bug route before this story reaches Ready For QA").
//
// BK-212 Slice 2 — there is no separate bug-detail page (BK-31 never shipped
// one). scope.md's own wording ("Deep link lands on the bug with its
// attached test and run context") maps naturally onto the EXISTING run-detail
// page (`/projects/{projectSlug}/runs/{runId}`, already the "run context"
// surface) rather than a new screen: a `bugId` query param deep-links into
// that page, which highlights + scrolls to the specific bug's originating
// step (RunnerView.tsx). A standalone bug (bugs.run_id null — 0046_bugs.sql)
// has no run to land on and no fallback route is defined by business-rules.md/
// scope.md for that case, so it resolves no route here (see the `bug` case
// below), not a broken link.
//
// The payload snapshot is the ONLY source for `project_slug` / `run_id` —
// this inbox never joins live run/test/project/bug tables to render OR to
// route (migration 0053's design: "the inbox never has to join live runs/
// tests/bugs to render a summary"), so a producer that omits either field
// from its payload yields no route here, not a broken link.

export interface NotificationEntityRef {
  entity_type: string
  entity_id: string | null
  entity_available: boolean
  payload: Record<string, unknown>
}

export function resolveNotificationHref(notification: NotificationEntityRef): string | null {
  if (!notification.entity_available || notification.entity_id === null) {
    return null;
  }

  const projectSlug = notification.payload.project_slug;
  if (typeof projectSlug !== 'string' || projectSlug.length === 0) {
    return null;
  }

  // `projectSlug` is producer-controlled JSONB — nothing validates its shape
  // at write time. Encode it before interpolating into the href so a
  // malformed/adversarial payload (embedded `/`, `?`, `..`) degrades to a
  // broken/escaped link instead of reshaping the route or injecting a query
  // string.
  const safeProjectSlug = encodeURIComponent(projectSlug);

  switch (notification.entity_type) {
    case 'run':
      return `/projects/${safeProjectSlug}/runs/${notification.entity_id}`;
    case 'test':
      return `/projects/${safeProjectSlug}/tests/${notification.entity_id}`;
    case 'bug': {
      // Deep-links into the run-detail page (the "run context" scope.md
      // asks for), highlighting this specific bug — see this file's header.
      // A standalone bug (no run_id in the payload snapshot) has nothing to
      // land on: no fallback route is defined for it, so it resolves `null`
      // rather than guessing one.
      const runId = notification.payload.run_id;
      if (typeof runId !== 'string' || runId.length === 0) {
        return null;
      }
      const safeRunId = encodeURIComponent(runId);
      const safeBugId = encodeURIComponent(notification.entity_id);
      return `/projects/${safeProjectSlug}/runs/${safeRunId}?bugId=${safeBugId}`;
    }
    default:
      // Any future/unknown entity_type — no detail route to send the user
      // to yet.
      return null;
  }
}
