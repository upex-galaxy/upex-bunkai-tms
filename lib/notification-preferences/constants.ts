// BK-213 — Notification preferences domain constants (framework-agnostic,
// Stack §10: shared/domain data lives outside React/Next code so it stays
// unit-testable without a DOM and importable from both the API layer and
// the client component).
//
// `mentions` is DELIBERATELY not part of `EDITABLE_EVENT_TYPES` — it is a
// declared-but-locked event type (business-rules.md: "locked until the Team
// Chat epic ships"). Keeping it out of the editable set means the PATCH
// route's Zod schema rejects it by construction (no bespoke error code
// needed), on top of migration 0062's own DB-level INSERT/UPDATE lock.

export const EDITABLE_EVENT_TYPES = ['run_lifecycle', 'bug_lifecycle'] as const;
export type EditableEventType = (typeof EDITABLE_EVENT_TYPES)[number];

export const CHANNELS = ['in_app', 'email'] as const;
export type NotificationChannel = (typeof CHANNELS)[number];

export const LOCKED_EVENT_TYPE = 'mentions' as const;
export type EventType = EditableEventType | typeof LOCKED_EVENT_TYPE;

// scope.md: "Defaults: in-app and email on for run lifecycle and bug
// lifecycle." An absent row for an editable cell means "never touched,
// still on default" -- see `grid.ts`.
export const DEFAULT_ENABLED_EDITABLE = true;
