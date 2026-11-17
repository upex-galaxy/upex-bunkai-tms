// BK-718 / ADR-0010 — Realtime channel config for the Defect Heatmap, the
// third consumer of the pattern BK-35 established (after the Runner and the
// notifications bell, BK-209). Like the second consumer, this module owns
// only the channel/binding SHAPE: the refetch-coalescing scheduler and the
// reconnect/reconciliation predicate are generic and are imported by the UI
// wiring (components/bugs/BugsHeatmapView.tsx) straight from
// `lib/runs/realtime-run-channel.ts`, never re-derived here.

export interface HeatmapChannelBinding {
  event: 'INSERT'
  schema: 'public'
  table: 'bugs'
  filter: string
}

export interface HeatmapChannelConfig {
  channelName: string
  bindings: HeatmapChannelBinding[]
}

// How long a steady stream of defect events may hold a refresh back (AI Tech
// Lead decision on BK-718): the trailing debounce alone restarts on every
// event, so an agent filing faster than 250 ms apart would starve the
// refresh past the 5-second bound (BR-6). Passed as the shared scheduler's
// `maxWaitMs`.
export const HEATMAP_REFETCH_MAX_WAIT_MS = 2000;

// INSERT only, filtered to the Project on screen. Heatmap figures depend only
// on a defect's created_at and module, and a defect is never deleted or
// re-attributed, so assignment and status UPDATEs move no figure. RLS
// (`bugs_select_workspace_member`, 0046_bugs.sql) scopes delivery to the
// subscriber's workspaces; the `project_id` filter is what keeps another
// Project of the same workspace from triggering a refresh.
//
// `instance` makes the topic unique per mount. realtime-js returns the
// EXISTING channel when asked for a topic it already holds, and
// `removeChannel` is asynchronous, so a quick remount (List/Heatmap toggles,
// React's dev double mount) would otherwise get back the channel being torn
// down and end with no live subscription. The topic is a client-side name
// only; the binding filter decides what is delivered.
export function buildHeatmapChannelConfig(projectId: string, instance: number): HeatmapChannelConfig {
  return {
    channelName: `bugs-heatmap-${projectId}-${instance}`,
    bindings: [
      { event: 'INSERT', schema: 'public', table: 'bugs', filter: `project_id=eq.${projectId}` },
    ],
  };
}
