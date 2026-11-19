import type { AutomationStatus, AutomationStatusEntry } from '@lib/tests/automation-status';
import { AUTOMATION_STATUS_LABEL } from '@lib/tests/automation-status';
import { ArrowRight, History } from 'lucide-react';
import { AutomationStatusBadge } from './AutomationStatusBadge';
import { LocalDateTime } from './LocalDateTime';

// BK-227 — the Status history tab: every automation status change of the Test,
// newest first, read-only for everyone (the history is append-only).

interface TestAutomationHistoryProps {
  status: AutomationStatus
  history: AutomationStatusEntry[]
}

export function TestAutomationHistory({ status, history }: TestAutomationHistoryProps) {
  return (
    <div className="flex-1 overflow-auto p-4">
      <section
        aria-labelledby="test-automation-history-title"
        data-testid="test-automation-history"
        className="mx-auto flex max-w-[820px] flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <History size={13} className="text-fg-3" aria-hidden />
          <h2 id="test-automation-history-title" className="m-0 text-sm font-semibold text-fg-1">
            Automation status history
          </h2>
          <span className="text-xs text-fg-3">Newest first, in your time zone</span>
        </div>

        {history.length === 0
          ? (
              <div
                data-testid="test-automation-history-empty"
                className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-stroke-2 px-6 py-10 text-center"
              >
                <AutomationStatusBadge status={status} />
                <p className="m-0 text-sm font-semibold text-fg-1">No status changes yet</p>
                <p className="m-0 max-w-md text-xs leading-relaxed text-fg-3">
                  {`This Test is ${AUTOMATION_STATUS_LABEL[status]}. Every change of its automation status is recorded here with who made it and when.`}
                </p>
              </div>
            )
          : (
              <ol className="m-0 flex list-none flex-col rounded-3 border border-stroke-1 bg-surface-1 p-0">
                {history.map(entry => (
                  <li
                    key={entry.id}
                    data-testid={`test-automation-history-entry-${entry.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stroke-1 px-3 py-2 last:border-b-0"
                  >
                    <span className="flex items-center gap-1.5">
                      <AutomationStatusBadge status={entry.from_status} />
                      <ArrowRight size={11} className="text-fg-4" aria-label="to" />
                      <AutomationStatusBadge status={entry.to_status} />
                    </span>
                    <span className="min-w-0 truncate text-sm text-fg-1" data-testid="test-automation-history-author">
                      {entry.actor_name}
                    </span>
                    <span className="ml-auto font-mono text-xs text-fg-3">
                      <LocalDateTime iso={entry.changed_at} data-testid="test-automation-history-time" />
                    </span>
                  </li>
                ))}
              </ol>
            )}
      </section>
    </div>
  );
}
