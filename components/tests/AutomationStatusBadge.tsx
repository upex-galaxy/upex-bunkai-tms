import type { AutomationStatus } from '@lib/tests/automation-status';
import type { LucideIcon } from 'lucide-react';
import { AUTOMATION_STATUS_LABEL, AUTOMATION_STATUS_TONE } from '@lib/tests/automation-status';
import { cn } from '@lib/utils';
import { Bot, Flag, User } from 'lucide-react';

// BK-227 — a Test's automation status as a `.status-chip`: icon and text, never
// color alone (master-design-plan §4.12).

export const AUTOMATION_STATUS_ICON: Record<AutomationStatus, LucideIcon> = {
  'manual-only': User,
  'candidate': Flag,
  'automated': Bot,
};

interface AutomationStatusBadgeProps {
  'status': AutomationStatus
  'className'?: string
  'data-testid'?: string
}

export function AutomationStatusBadge({ status, className, 'data-testid': testId }: AutomationStatusBadgeProps) {
  const Icon = AUTOMATION_STATUS_ICON[status];
  return (
    <span
      className={cn('status-chip shrink-0', className)}
      data-status={AUTOMATION_STATUS_TONE[status]}
      data-automation-status={status}
      data-testid={testId}
    >
      <Icon size={10} aria-hidden />
      {AUTOMATION_STATUS_LABEL[status]}
    </span>
  );
}
