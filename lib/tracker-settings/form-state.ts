import {
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
  if (issueTypeName.length < 1 || issueTypeName.length > ISSUE_TYPE_MAX) {
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

// A check result belongs to the pair that was checked: any edit of the key or the
// issue type drops it (AC-2.7). Toggling the switch does not change what was checked.
export function checkResultFor(result: TrackerCheckResult | null, current: TrackerFormValues): TrackerCheckResult | null {
  if (result === null) {
    return null;
  }
  const { destinationKey, issueTypeName } = normalizeValues(current);
  return result.destinationKey === destinationKey && result.issueTypeName === issueTypeName ? result : null;
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
