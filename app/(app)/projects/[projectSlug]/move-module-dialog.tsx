'use client';

import { Button } from '@components/ui/button';
import { computeDepth, isDescendantPath, MAX_MODULE_DEPTH, movedSubtreeMaxDepth } from '@lib/modules/path';
import { moduleBreadcrumb } from '@lib/tree';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string }
  }
}

interface ModuleLite {
  id: string
  name: string
  path: string
  parent_module_id: string | null
}

interface MoveModuleDialogProps {
  // The module being moved (with its current path + parent).
  source: ModuleLite
  // Flat list of every module in the project, used to compute valid destinations.
  modules: ModuleLite[]
  // Invoked after a successful move so the host can close the dialog.
  onMoved?: () => void
  // Invoked when the user dismisses the dialog.
  onCancel?: () => void
}

// Sentinel for the "move to the project root" option (distinct from a real id).
const ROOT = '__root__';

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.details?.reason) {
    case 'move_cycle':
      return 'A module cannot be moved under itself or one of its own sub-modules.';
    case 'depth_exceeded':
      return 'The maximum nesting depth is 6 levels.';
    case 'parent_invalid':
      return 'The chosen destination is no longer valid.';
    case 'module_slug_duplicate':
      return 'The destination already has a module with this name.';
    case 'not_a_member':
      return 'You do not have permission in this project.';
  }
  switch (body.error?.code) {
    case 'not_found':
      return 'This module no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Could not move the module.';
  }
}

export function MoveModuleDialog({ source, modules, onMoved, onCancel }: MoveModuleDialogProps) {
  const router = useRouter();
  const [targetId, setTargetId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Eligible destinations: exclude the module + its subtree (cycle), its current
  // parent (no-op), and any target that would push the deepest node past level 6.
  // Mirrors the server's guards so the picker only offers moves that will succeed.
  const { options, rootEligible } = useMemo(() => {
    const subtreeMax = modules
      .filter(m => isDescendantPath(source.path, m.path))
      .reduce((max, m) => Math.max(max, computeDepth(m.path)), 0);

    const opts = modules
      .filter(m =>
        !isDescendantPath(source.path, m.path)
        && m.id !== source.parent_module_id
        && movedSubtreeMaxDepth(source.path, subtreeMax, m.path) <= MAX_MODULE_DEPTH)
      .map(m => ({ id: m.id, label: moduleBreadcrumb(modules, m.id).join(' / ') }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return { options: opts, rootEligible: source.parent_module_id !== null };
  }, [modules, source]);

  const noDestinations = options.length === 0 && !rootEligible;
  const isValid = targetId !== '' && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) { return; }
    setSubmitting(true);
    setError(null);
    try {
      const parentModuleId = targetId === ROOT ? null : targetId;
      const response = await fetch(`/api/v1/modules/${source.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parent_module_id: parentModuleId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(friendlyError(body));
        setSubmitting(false);
        return;
      }
      toast.success(`Moved “${source.name}”`);
      router.refresh();
      onMoved?.();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      data-testid="move-module-form"
      className="w-full rounded-3 border border-stroke-2 bg-surface-1 p-5"
    >
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Move module
        </div>
        <p className="m-0 text-xs text-fg-3">
          Move
          {' '}
          <span className="font-medium text-fg-1">{source.name}</span>
          {' '}
          and its sub-tree to a new parent.
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Destination
        </span>
        <select
          data-testid="move-module-target"
          value={targetId}
          disabled={noDestinations}
          onChange={(e) => {
            setTargetId(e.target.value);
            if (error) { setError(null); }
          }}
          className="flex h-9 w-full rounded-2 border border-stroke-2 bg-surface-2 px-2.5 text-sm text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3 focus-visible:border-accent focus-visible:bg-surface-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            {noDestinations ? 'No valid destinations' : 'Choose a destination…'}
          </option>
          {rootEligible && <option value={ROOT}>Project root</option>}
          {options.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>

      {error && (
        <p className="mb-3 text-xs text-signal-fail" data-testid="move-module-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          data-testid="move-module-submit"
          variant="primary"
          size="sm"
          disabled={!isValid}
        >
          {submitting ? 'Moving…' : 'Move module'}
          <ArrowRight size={13} />
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-testid="move-module-cancel"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
