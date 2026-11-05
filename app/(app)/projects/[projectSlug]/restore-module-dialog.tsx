'use client';

import { revalidateAfterArchiveChange } from '@app/(app)/atcs/actions';
import { Button } from '@components/ui/button';
import { restoreModule } from '@lib/modules/archive-client';
import { RESTORE_MODULE_FAILURE_COPY, restoreModuleToast } from '@lib/modules/restore-copy';
import { ArchiveRestore, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

// BK-601 — confirms a Module restore, with the delete dialog's shell. A refusal stays
// here with its reason and a Retry: the user can fix what blocked it (rename a sibling,
// restore the parent first) and try again without finding the row in the tree again.

interface RestoreModuleDialogProps {
  moduleId: string
  moduleName: string
  onRestored: () => void
  onCancel: () => void
}

export function RestoreModuleDialog({ moduleId, moduleName, onRestored, onCancel }: RestoreModuleDialogProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const onConfirm = async () => {
    setSubmitting(true);
    setFailure(null);
    const result = await restoreModule(moduleId);
    if (!result.ok) {
      setFailure(result.errorMessage);
      setSubmitting(false);
      return;
    }
    // The restore already happened: a failed revalidate must not read as a failure.
    await revalidateAfterArchiveChange().catch(() => {});
    toast.success(restoreModuleToast(result.restored));
    router.refresh();
    onRestored();
  };

  return (
    <div
      data-testid="restore-module-dialog"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-3">
        Restore module
      </div>

      <p className="m-0 mb-2 text-sm text-fg-1">
        Restore
        {' '}
        <span className="font-semibold text-fg-0">{moduleName}</span>
        ?
      </p>

      <p className="m-0 mb-4 text-xs text-fg-3">
        Everything its archive took down comes back with it, in the same place and order.
        Anything archived on its own before that stays archived.
      </p>

      {failure !== null && (
        <div role="alert" data-testid="restore-module-error" className="mb-3 text-xs text-signal-fail">
          <p className="m-0 font-semibold">{RESTORE_MODULE_FAILURE_COPY}</p>
          <p className="m-0 mt-1 text-fg-2">{failure}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid="restore-module-confirm"
          variant="primary"
          size="sm"
          onClick={() => { void onConfirm(); }}
          disabled={submitting}
        >
          {failure !== null && !submitting ? <RefreshCw size={13} aria-hidden /> : <ArchiveRestore size={13} aria-hidden />}
          {submitting ? 'Restoring…' : failure !== null ? 'Retry' : 'Restore module'}
        </Button>
        <Button
          type="button"
          data-testid="restore-module-cancel"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
