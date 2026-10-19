import {
  codePointLength,
  DESTINATION_KEY_PATTERN,
  ISSUE_TYPE_MAX,
  normalizeDestinationKey,
  TRACKER_SETTINGS_MESSAGES,
} from './rules';

// BK-371 — the pure state rules of the "Jira defect sync" card. Everything the
// screen decides without a network round trip lives here so it can be tested
// without a DOM: what counts as a change, when Save and "Run connection check"
// are usable, when a check result stops being valid, and the inline validation
// copy. The server re-applies every rule; these only spare the user a round trip.

export interface TrackerFormValues {
  destinationKey: string
  issueTypeName: string
  enabled: boolean
}

export interface TrackerFieldErrors {
  destinationKey?: string
  issueTypeName?: string
}

// The outcome of a connection check, tied to the exact pair that was checked.
export interface TrackerCheckResult {
  destinationKey: string
  issueTypeName: string
  ok: boolean
  message: string | null
}

// Same normalisation the server applies, so "qas" and " QAS " are not edits of "QAS".
export function normalizeValues(values: TrackerFormValues): TrackerFormValues {
  return {
    destinationKey: normalizeDestinationKey(values.destinationKey),
    issueTypeName: values.issueTypeName.trim(),
    enabled: values.enabled,
  };
}

export function isDirty(saved: TrackerFormValues, current: TrackerFormValues): boolean {
  const a = normalizeValues(saved);
  const b = normalizeValues(current);
  return a.destinationKey !== b.destinationKey || a.issueTypeName !== b.issueTypeName || a.enabled !== b.enabled;
}

export function validateValues(values: TrackerFormValues): TrackerFieldErrors {
  const { destinationKey, issueTypeName } = normalizeValues(values);
  const errors: TrackerFieldErrors = {};
  if (destinationKey === '') {
    errors.destinationKey = TRACKER_SETTINGS_MESSAGES.destination_required;
  }
  else if (!DESTINATION_KEY_PATTERN.test(destinationKey)) {
    errors.destinationKey = TRACKER_SETTINGS_MESSAGES.invalid_destination_key;
  }
  if (codePointLength(issueTypeName) < 1 || codePointLength(issueTypeName) > ISSUE_TYPE_MAX) {
    errors.issueTypeName = TRACKER_SETTINGS_MESSAGES.invalid_issue_type;
  }
  return errors;
}

// Save is usable only for an admin, with nothing in flight, once a value changed
// (PO Q5: a plain save must never work as a hidden retry button).
export function canSave(args: { saved: TrackerFormValues, current: TrackerFormValues, canEdit: boolean, busy: boolean }): boolean {
  return args.canEdit && !args.busy && isDirty(args.saved, args.current);
}

export function canRunCheck(args: { current: TrackerFormValues, canEdit: boolean, busy: boolean }): boolean {
  return args.canEdit && !args.busy && normalizeValues(args.current).destinationKey !== '';
}

// The card's three linked pieces of state and the ONLY transitions between them,
// so "the check result is cleared on any edit" (PO Q6, AC-2.7) is one tested rule
// and not a convention scattered through event handlers.
export interface TrackerCardState {
  saved: TrackerFormValues
  current: TrackerFormValues
  check: TrackerCheckResult | null
}

export function initialCardState(initial: TrackerFormValues): TrackerCardState {
  return { saved: initial, current: initial, check: null };
}

// ANY edit clears the check result: a key or issue type edit, a Switch toggle, and
// an edit that is later reverted (the earlier result is never resurrected).
export function applyEdit(state: TrackerCardState, patch: Partial<TrackerFormValues>): TrackerCardState {
  return { ...state, current: { ...state.current, ...patch }, check: null };
}

// A check outcome is recorded only for the pair it was run on. If the form no
// longer holds that pair, the late answer is dropped instead of shown for a value
// nobody checked.
export function applyCheckResult(
  state: TrackerCardState,
  args: { checked: TrackerFormValues, ok: boolean, message: string | null },
): TrackerCardState {
  const checked = normalizeValues(args.checked);
  const now = normalizeValues(state.current);
  if (checked.destinationKey !== now.destinationKey || checked.issueTypeName !== now.issueTypeName) {
    return { ...state, check: null };
  }
  return {
    ...state,
    check: { destinationKey: checked.destinationKey, issueTypeName: checked.issueTypeName, ok: args.ok, message: args.message },
  };
}

// A successful save adopts the stored values as both the saved and the current
// ones and clears the check result: it described the form BEFORE the save.
export function applySaved(state: TrackerCardState, stored: TrackerFormValues): TrackerCardState {
  return { ...state, saved: stored, current: stored, check: null };
}

export function toRequestBody(current: TrackerFormValues, confirmQueueCount?: number): Record<string, unknown> {
  const { destinationKey, issueTypeName, enabled } = normalizeValues(current);
  return {
    destination_project_key: destinationKey,
    issue_type_name: issueTypeName,
    enabled,
    ...(confirmQueueCount === undefined ? {} : { confirm_queue_count: confirmQueueCount }),
  };
}

// The confirmation dialog copy (PO Q1, frozen).
export function queueDialogCopy(args: { queueCount: number, destinationKey: string }): { description: string, confirmLabel: string } {
  return {
    description: `This change queues ${args.queueCount} defects of this Project for Jira project ${args.destinationKey}. Issues created in Jira cannot be removed from Bunkai.`,
    confirmLabel: `Queue ${args.queueCount} defects`,
  };
}

export const READ_ONLY_NOTE = 'Only workspace owners and admins can change this.';
