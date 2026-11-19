'use client';

import type { AutomationStatus } from '@lib/tests/automation-status';
import { AUTOMATION_STATUS_LABEL, AUTOMATION_STATUS_TONE, AUTOMATION_STATUSES, isAutomationStatus } from '@lib/tests/automation-status';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AUTOMATION_STATUS_ICON, AutomationStatusBadge } from './AutomationStatusBadge';

// BK-227 — the automation status in the Test header. A member, admin or owner
// gets a dropdown; a viewer, or anyone on an archived Test, gets the badge
// alone, with no popup affordance at all. The API stays the authority.

interface AutomationStatusControlProps {
  testId: string
  status: AutomationStatus
  canChange: boolean
}

export function AutomationStatusControl({ testId, status, canChange }: AutomationStatusControlProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const busy = saving || isRefreshing;

  if (!canChange) {
    return <AutomationStatusBadge status={status} data-testid="test-automation-status" />;
  }

  const change = async (next: string) => {
    if (!isAutomationStatus(next) || next === status || busy) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/tests/${testId}/automation-status`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? 'Could not change the automation status. Try again.');
        startTransition(() => router.refresh());
        return;
      }
      toast.success(`Automation status set to ${AUTOMATION_STATUS_LABEL[next]}.`);
      startTransition(() => router.refresh());
    }
    catch {
      toast.error('Could not change the automation status. Check your connection and try again.');
    }
    finally {
      setSaving(false);
    }
  };

  const Icon = AUTOMATION_STATUS_ICON[status];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          data-testid="test-automation-status-trigger"
          data-automation-status={status}
          aria-label={`Automation status: ${AUTOMATION_STATUS_LABEL[status]}. Change status`}
          className="status-chip shrink-0 cursor-pointer transition-opacity duration-token ease-token hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          data-status={AUTOMATION_STATUS_TONE[status]}
        >
          <Icon size={10} aria-hidden />
          {AUTOMATION_STATUS_LABEL[status]}
          <ChevronDown size={10} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          data-testid="test-automation-status-menu"
          className="z-50 min-w-[200px] rounded-3 border border-stroke-2 bg-surface-1 p-1 shadow-pop"
        >
          <DropdownMenu.Label className="px-2 py-1 font-mono text-2xs font-semibold uppercase tracking-widest text-fg-4">
            Automation status
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={status} onValueChange={value => void change(value)}>
            {AUTOMATION_STATUSES.map(option => (
              <DropdownMenu.RadioItem
                key={option}
                value={option}
                data-testid={`test-automation-status-option-${option}`}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2 px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
              >
                <AutomationStatusBadge status={option} />
                <DropdownMenu.ItemIndicator>
                  <Check size={12} className="text-fg-2" aria-hidden />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
