// BK-209 (Slice 3: UI) — entity deep-link resolution for a notification row
// (Dev Answer, comments.md 2026-07-16: "Run: /projects/{projectSlug}/runs/
// {runId}. Test: /projects/{projectSlug}/tests/{testId}. Bug: route depends
// on the BK-31 Bugs & Defect Heatmap implementation; Dev must define the
// final bug route before this story reaches Ready For QA" — that route still
// does not exist, so `bug` stays deliberately unmapped here, exactly as
// migration 0053_notifications.sql's own `bunkai_list_notifications` comment
// anticipates).
//
// The payload snapshot is the ONLY source for `project_slug` — this inbox
// never joins live run/test/project tables to render OR to route (migration
// 0053's design: "the inbox never has to join live runs/tests/bugs to render
// a summary"), so a producer that omits `project_slug` from its payload
// yields no route here, not a broken link. No producer (BK-211/BK-212) has
// shipped yet, so every notification seeded today lacks this field — that is
// an expected, graceful `null`, not a bug in this resolver.

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

  switch (notification.entity_type) {
    case 'run':
      return `/projects/${projectSlug}/runs/${notification.entity_id}`;
    case 'test':
      return `/projects/${projectSlug}/tests/${notification.entity_id}`;
    default:
      // `bug` (blocked on BK-31/BK-212) and any future/unknown entity_type —
      // no detail route to send the user to yet.
      return null;
  }
}
