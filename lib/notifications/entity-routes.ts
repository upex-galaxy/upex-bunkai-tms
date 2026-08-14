// BK-209 (Slice 3: UI) — entity deep-link resolution for a notification row
// (Dev Answer, comments.md 2026-07-16: "Run: /projects/{projectSlug}/runs/
// {runId}. Test: /projects/{projectSlug}/tests/{testId}. Bug: route depends
// on the BK-31 Bugs & Defect Heatmap implementation; Dev must define the
// final bug route before this story reaches Ready For QA").
//
// BK-337 — repoints the `bug` case at the new defect detail record
// (`/projects/{projectSlug}/bugs/{bugId}`), for a run-linked defect AND a
// standalone one alike. This is the same question the 2026-08-10 Product
// Owner decision on BK-337 already answered for the defects list's Run cell:
// a bug reference opens the defect record, and the Origin panel inside that
// record is the one route onward to the run itself — landing a notification
// on the run page instead would answer "what does a bug reference open?" two
// different ways on two surfaces. This also gives a standalone bug's
// notification a working destination for the first time (previously `null`
// — see the superseded BK-212 comment this replaced). Scope stays narrow:
// the inbox UI, `entity_available`, and which events are produced remain
// BK-212's; only this ONE switch case changes.
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
      // BK-337 — the defect detail record, for a run-linked defect AND a
      // standalone one alike (see this file's header). No `run_id` branch
      // needed any more: the record itself carries the Origin panel that
      // links onward to the run, when there is one.
      const safeBugId = encodeURIComponent(notification.entity_id);
      return `/projects/${safeProjectSlug}/bugs/${safeBugId}`;
    }
    default:
      // Any future/unknown entity_type — no detail route to send the user
      // to yet.
      return null;
  }
}
