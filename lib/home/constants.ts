// BK-255 — which `activity_log.action` values the Home welcome banner counts as
// "an ATC changed" and "a Test changed". Kept in a zero-import module, matching
// `lib/activity/constants.ts`'s split, so the server page can import them
// without dragging anything else along.
//
// These are NOT the same list as `ACTIVITY_ALLOWED_ACTIONS` (the /activity feed
// allowlist) and must not be collapsed into it: that list is "what is worth
// showing in a feed" and spans modules, runs and bugs; this one is "what the
// member would call a change to their ATCs and Tests". The values themselves
// come from the RPCs that write them — `atc.created` (0021, 0028),
// `atc.updated` (0021, 0035), `test.created` (0024), `test.reordered` (0026),
// `test.tags_changed` (0030).

export const HOME_ATC_CHANGE_ACTIONS = [
  'atc.created',
  'atc.updated',
] as const;

export const HOME_TEST_CHANGE_ACTIONS = [
  'test.created',
  'test.reordered',
  'test.tags_changed',
] as const;
