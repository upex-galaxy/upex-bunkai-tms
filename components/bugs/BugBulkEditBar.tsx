'use client';

import type { BugBulkChange, BugBulkField } from '@lib/bugs/bulk-edit';
import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import { Button } from '@components/ui/button';
import { Select } from '@components/ui/select';
import {
  BUG_BULK_STATUS_LABEL,
  BUG_BULK_STATUS_TARGETS,
  bugBulkSelectionProblem,
  pluralBugs,
} from '@lib/bugs/bulk-edit';
import { BUG_SEVERITY_LABEL, BUG_SEVERITY_VALUES } from '@lib/bugs/constants';
import { Pencil, X } from 'lucide-react';
import { useState } from 'react';

// BK-2098 — the bulk bar of the Project Bug Reports list (master-design-plan §5
// D86, §4.32), the live ATC bulk bar (D64) with the two Bug fields. It never
// writes: "Review change" opens the confirmation.

interface BugBulkEditBarProps {
  count: number
  hiddenCount: number
  onClear: () => void
  onReview: (change: BugBulkChange) => void
}

const FIELD_LABEL: Record<BugBulkField, string> = {
  status: 'Status',
  severity: 'Severity',
};

export function BugBulkEditBar({ count, hiddenCount, onClear, onReview }: BugBulkEditBarProps) {
  const [field, setField] = useState<BugBulkField>('status');
  const [status, setStatus] = useState<BugStatus | ''>('');
  const [severity, setSeverity] = useState<BugSeverity | ''>('');

  const selectionProblem = bugBulkSelectionProblem(count);

  let change: BugBulkChange | null = null;
  if (field === 'status' && status !== '') {
    change = { field: 'status', status };
  }
  else if (field === 'severity' && severity !== '') {
    change = { field: 'severity', severity };
  }

  const review = () => {
    if (!change || selectionProblem) { return; }
    onReview(change);
  };

  return (
    <div
      data-testid="bugs-bulk-bar"
      role="region"
      aria-label="Bulk edit the selected Bugs"
      className="flex flex-wrap items-end gap-4 rounded-3 border border-accent bg-surface-2 p-3 shadow-card"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Selected</span>
        <span data-testid="bugs-bulk-selected" aria-live="polite" className="flex h-8 items-center text-sm text-fg-0">
          {pluralBugs(count)}
        </span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Change</span>
        <Select
          data-testid="bugs-bulk-field"
          value={field}
          onChange={e => setField(e.target.value as BugBulkField)}
          className="min-w-[140px]"
        >
          {(['status', 'severity'] as const).map(f => (
            <option key={f} value={f}>{FIELD_LABEL[f]}</option>
          ))}
        </Select>
      </label>

      {field === 'status' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Set status to</span>
          <Select
            data-testid="bugs-bulk-status"
            value={status}
            onChange={e => setStatus(e.target.value as BugStatus | '')}
            className="min-w-[160px]"
          >
            <option value="">Choose a status…</option>
            {BUG_BULK_STATUS_TARGETS.map(s => (
              <option key={s} value={s}>{BUG_BULK_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </label>
      )}

      {field === 'severity' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Set severity to</span>
          <Select
            data-testid="bugs-bulk-severity"
            value={severity}
            onChange={e => setSeverity(e.target.value as BugSeverity | '')}
            className="min-w-[160px]"
          >
            <option value="">Choose a severity…</option>
            {BUG_SEVERITY_VALUES.map(s => (
              <option key={s} value={s}>{`${s} ${BUG_SEVERITY_LABEL[s]}`}</option>
            ))}
          </Select>
        </label>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="bugs-bulk-review"
          disabled={!change || selectionProblem !== null}
          onClick={review}
        >
          <Pencil size={12} aria-hidden />
          Review change
        </Button>
        <Button type="button" variant="ghost" size="sm" data-testid="bugs-bulk-clear" onClick={onClear}>
          <X size={12} aria-hidden />
          Clear selection
        </Button>
      </div>

      <div aria-live="polite" className="basis-full text-xs">
        {selectionProblem && (
          <p data-testid="bugs-bulk-ceiling" className="m-0 text-signal-fail">{selectionProblem}</p>
        )}
        {hiddenCount > 0 && (
          <p data-testid="bugs-bulk-hidden" className="m-0 text-fg-2">
            {hiddenCount === 1
              ? '1 selected Bug is not shown in the current list. The change applies to it too.'
              : `${hiddenCount} selected Bugs are not shown in the current list. The change applies to them too.`}
          </p>
        )}
      </div>
    </div>
  );
}
