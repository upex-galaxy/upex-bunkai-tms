// BK-227 — a Test's automation status: the three values (wire values of
// migration 0106), their words and tones, and the Tests list's status filter.
// Pure and zero-import so the API schema, the list and the detail header share
// one definition.

export const AUTOMATION_STATUSES = ['manual-only', 'candidate', 'automated'] as const;

export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const AUTOMATION_STATUS_LABEL: Record<AutomationStatus, string> = {
  'manual-only': 'Manual-only',
  'candidate': 'Automation candidate',
  'automated': 'Automated',
};

// The `.status-chip` tone per status (master-design-plan §4.12).
export const AUTOMATION_STATUS_TONE: Record<AutomationStatus, 'skipped' | 'blocked' | 'running'> = {
  'manual-only': 'skipped',
  'candidate': 'blocked',
  'automated': 'running',
};

export const DEFAULT_AUTOMATION_STATUS: AutomationStatus = 'manual-only';

export function isAutomationStatus(value: unknown): value is AutomationStatus {
  return typeof value === 'string' && (AUTOMATION_STATUSES as readonly string[]).includes(value);
}

// The generated row type is a plain `string` (the CHECK of 0106 is not typed).
export function toAutomationStatus(value: unknown): AutomationStatus {
  return isAutomationStatus(value) ? value : DEFAULT_AUTOMATION_STATUS;
}

export interface AutomationStatusEntry {
  id: string
  from_status: AutomationStatus
  to_status: AutomationStatus
  actor_user_id: string | null
  actor_name: string
  changed_at: string
}

export interface TestAutomationStatus {
  test_id: string
  automation_status: AutomationStatus
  history: AutomationStatusEntry[]
}

export type AutomationStatusCounts = Record<AutomationStatus, number>;

// The counts take the set every other filter already narrowed, never the
// status-filtered one, so they stay put while the status filter changes (D1).
export function countByAutomationStatus(tests: readonly { automation_status: AutomationStatus }[]): AutomationStatusCounts {
  const counts: AutomationStatusCounts = { 'manual-only': 0, 'candidate': 0, 'automated': 0 };
  for (const test of tests) {
    counts[test.automation_status] += 1;
  }
  return counts;
}

export function filterTestsByAutomationStatus<T extends { automation_status: AutomationStatus }>(tests: readonly T[], status: AutomationStatus | null): T[] {
  if (status === null) {
    return [...tests];
  }
  return tests.filter(t => t.automation_status === status);
}

// The filter rides the address (`?automation=automated`) so Back from a Test restores it.
export const AUTOMATION_FILTER_PARAM = 'automation';

export function parseAutomationStatusFilter(params: { get: (key: string) => string | null }): AutomationStatus | null {
  const value = params.get(AUTOMATION_FILTER_PARAM);
  return isAutomationStatus(value) ? value : null;
}

// Single-select: choosing the active status again clears the filter.
export function nextAutomationStatusFilter(current: AutomationStatus | null, chosen: AutomationStatus): AutomationStatus | null {
  return current === chosen ? null : chosen;
}

export function automationStatusFilterSearch(currentSearch: string, status: AutomationStatus | null): string {
  const params = new URLSearchParams(currentSearch);
  if (status === null) {
    params.delete(AUTOMATION_FILTER_PARAM);
  }
  else {
    params.set(AUTOMATION_FILTER_PARAM, status);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

// `YYYY-MM-DD HH:mm` in the given time zone (the viewer's when omitted).
export function formatStatusChangeTime(iso: string, timeZone?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return '—';
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(time));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}
