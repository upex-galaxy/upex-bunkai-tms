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
