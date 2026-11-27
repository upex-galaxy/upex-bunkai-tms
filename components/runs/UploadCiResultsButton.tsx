'use client';

import { useWorkbench } from '@app/(app)/projects/[projectSlug]/workbench-context';
import { UploadCiResultsDialog } from '@components/runs/UploadCiResultsDialog';
import { Button } from '@components/ui/button';
import { Upload } from 'lucide-react';
import { useState } from 'react';

export const UPLOAD_READ_ONLY_TITLE = 'This project is read-only because the workspace is over its plan\'s project limit.';

export function UploadCiResultsButton({ onCreated }: { onCreated: (runId: string) => void }) {
  const { tests, environments, canCreate, readOnly } = useWorkbench();
  const [open, setOpen] = useState(false);

  if (!canCreate) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        data-testid="ci-upload-open"
        disabled={readOnly === true}
        title={readOnly === true ? UPLOAD_READ_ONLY_TITLE : undefined}
        onClick={() => setOpen(true)}
      >
        <Upload size={12} />
        Upload CI results
      </Button>
      <UploadCiResultsDialog
        open={open}
        onOpenChange={setOpen}
        tests={tests.map(test => ({ id: test.id, title: test.title }))}
        environments={environments.map(env => ({ id: env.id, name: env.name }))}
        onCreated={onCreated}
      />
    </>
  );
}
