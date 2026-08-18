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
// BK-398 — extends the switch (atc, module, project added) so the Command
// Palette reuses the SAME map rather than forking a second one (Jira comment
// 12407, AI Product Owner ruling: "Extend the existing switch in that file
// rather than forking a second mapper. It handles run, test and bug today;
// add atc, module and project. One map, two callers."). `buildEntityHref` is
// the shared core; `resolveNotificationHref` becomes a thin adapter over the
// notification row's narrower shape (only run/test/bug ever appear there —
// notifications are never produced for atc/module/project events).
//
// The payload snapshot is the ONLY source for `project_slug` / `run_id` —
// this inbox never joins live run/test/project/bug tables to render OR to
// route (migration 0053's design: "the inbox never has to join live runs/
// tests/bugs to render a summary"), so a producer that omits either field
// from its payload yields no route here, not a broken link.

export type SearchEntityType = 'atc' | 'test' | 'project' | 'module' | 'bug' | 'run';

// BK-398 final destination contract (Jira comment 12407, AI Product Owner
// correction (b) over the shift-left refinement's original 6-row table):
//   ATC     /projects/{slug}/atcs/{atcId}
//   Test    /projects/{slug}/tests/{testId}
//   Project /projects/{slug}                    (slug-keyed, the one exception)
//   Module  /projects/{slug}?module={moduleId}   (id-keyed, NOT ?modulePath=)
//   Bug     /projects/{slug}/bugs/{bugId}        (the defect record, not a filtered list)
//   Run     /projects/{slug}/runs/{runId}
// `slug` is ALWAYS encodeURIComponent-ed (mirrors this file's existing
// `safeProjectSlug` treatment) — entity ids are not (they are UUIDs, never
// producer-controlled free text).
export function buildEntityHref(
  entityType: SearchEntityType,
  params: { projectSlug: string, entityId: string },
): string {
  const safeSlug = encodeURIComponent(params.projectSlug);
  // `entityId` is a UUID in every production write path, but this file's
  // own prior `bug` case already encoded it defensively (the notification
  // row's `entity_id` is producer-controlled JSONB, same as `project_slug`
  // above) — this now applies that same defense uniformly across all six
  // types rather than leaving five of them un-encoded by omission.
  const safeId = encodeURIComponent(params.entityId);
  switch (entityType) {
    case 'atc':
      return `/projects/${safeSlug}/atcs/${safeId}`;
    case 'test':
      return `/projects/${safeSlug}/tests/${safeId}`;
    case 'project':
      return `/projects/${safeSlug}`;
    case 'module':
      return `/projects/${safeSlug}?module=${safeId}`;
    case 'bug':
      return `/projects/${safeSlug}/bugs/${safeId}`;
    case 'run':
      return `/projects/${safeSlug}/runs/${safeId}`;
    default:
      return `/projects/${safeSlug}`;
  }
}

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

  // Only run/test/bug are ever produced into the notification inbox
  // (BK-212's event set) — atc/module/project never reach here, so this
  // stays a narrow subset of `buildEntityHref`'s switch, not a re-fork of it.
  switch (notification.entity_type) {
    case 'run':
    case 'test':
    case 'bug':
      return buildEntityHref(notification.entity_type, {
        projectSlug,
        entityId: notification.entity_id,
      });
    default:
      // Any future/unknown entity_type — no detail route to send the user
      // to yet.
      return null;
  }
}
