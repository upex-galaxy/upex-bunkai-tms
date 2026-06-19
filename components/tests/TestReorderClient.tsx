'use client';

import type { ChainedAtc, ExpandedTest } from '@components/tests/TestDetailView';
import type { DragEndEvent } from '@dnd-kit/core';
import { ChainedAtcCard } from '@components/tests/ChainedAtcCard';
import { Button } from '@components/ui/button';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

// BK-28 — interactive chain-reorder region of the Test detail page. Rendered only
// when the viewer is a member+ (TestDetailView gates on `canReorder`). Drag a row
// to a new slot; a Save bar appears while the order is dirty. Save sends the
// COMPLETE new order as `step_ids` (the stable per-row handle) with the current
// version on `X-If-Match`. A 409 opens a conflict notice showing the live order;
// the user reloads to start over. Submitting the unchanged order is a server-side
// no-op (no version bump, no event).

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: { reason?: string, current_version?: number, current_chain?: string[] }
  }
}

interface TestReorderClientProps {
  test: ExpandedTest
  projectSlug: string
}

interface ConflictState {
  currentVersion?: number
  currentChain?: string[]
}

function friendlyError(body: ApiErrorBody): string {
  switch (body.error?.code) {
    case 'chain_invalid':
      return 'The chain must keep exactly the same ATCs — no empty or duplicate rows.';
    case 'chain_mismatch':
      return 'The chain changed underneath you — reload and try again.';
    case 'forbidden':
      return 'You do not have permission to reorder this Test.';
    case 'not_found':
      return 'This Test no longer exists.';
    case 'unauthorized':
      return 'Your session expired — sign in again.';
    default:
      return body.error?.message ?? 'Could not save the new order.';
  }
}

export function TestReorderClient({ test, projectSlug }: TestReorderClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState<ChainedAtc[]>(test.atcs);
  const [baseline, setBaseline] = useState<ChainedAtc[]>(test.atcs);
  const [version, setVersion] = useState(test.version);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dirty = useMemo(
    () => order.some((atc, i) => atc.step_id !== baseline[i]?.step_id),
    [order, baseline],
  );

  // atc_id -> title, for rendering a friendly conflict order from the 409 body
  // (which carries atc_ids). The set is preserved across a reorder, so every id
  // in current_chain resolves here.
  const titleByAtcId = useMemo(() => {
    const map = new Map<string, string>();
    for (const atc of test.atcs) {
      if (!map.has(atc.id)) { map.set(atc.id, atc.title); }
    }
    return map;
  }, [test.atcs]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) { return; }
    setOrder((prev) => {
      const from = prev.findIndex(a => a.step_id === active.id);
      const to = prev.findIndex(a => a.step_id === over.id);
      if (from === -1 || to === -1) { return prev; }
      return arrayMove(prev, from, to);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/v1/tests/${test.id}/reorder`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-if-match': String(version) },
        body: JSON.stringify({ step_ids: order.map(a => a.step_id) }),
      });
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setConflict({
          currentVersion: body.error?.details?.current_version,
          currentChain: body.error?.details?.current_chain,
        });
        setSaving(false);
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        toast.error(friendlyError(body));
        setSaving(false);
        return;
      }
      const body = (await response.json()) as { test: ExpandedTest };
      setVersion(body.test.version);
      setOrder(body.test.atcs);
      setBaseline(body.test.atcs);
      toast.success('Chain reordered');
      router.refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    }
    finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setOrder(baseline);
  }

  return (
    <>
      {dirty && (
        <div
          data-testid="test-reorder-bar"
          className="sticky top-0 z-10 flex items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2/95 px-3 py-2 backdrop-blur"
        >
          <span className="mr-auto text-xs text-fg-2">Chain order changed — unsaved.</span>
          <Button
            type="button"
            data-testid="test-reorder-save"
            variant="primary"
            size="sm"
            onClick={() => { void handleSave(); }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save order'}
          </Button>
          <Button
            type="button"
            data-testid="test-reorder-cancel"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order.map(a => a.step_id)} strategy={verticalListSortingStrategy}>
          {order.map((atc, index) => (
            <SortableChainRow
              key={atc.step_id}
              // Renumber the displayed position to reflect the live local order.
              atc={{ ...atc, position: index + 1 }}
              projectSlug={projectSlug}
            />
          ))}
        </SortableContext>
      </DndContext>

      {conflict && (
        <ConflictNotice
          conflict={conflict}
          titleByAtcId={titleByAtcId}
          onReload={() => { setConflict(null); router.refresh(); }}
          onDismiss={() => setConflict(null)}
        />
      )}
    </>
  );
}

function SortableChainRow({ atc, projectSlug }: { atc: ChainedAtc, projectSlug: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: atc.step_id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-2">
      <button
        type="button"
        data-testid={`test-reorder-handle-${atc.position}`}
        aria-label={`Drag to reorder ATC ${atc.slug}`}
        className="flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-3 hover:border-stroke-3 hover:text-fg-1 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <div className="min-w-0 flex-1">
        <ChainedAtcCard atc={atc} projectSlug={projectSlug} />
      </div>
    </div>
  );
}

function ConflictNotice({
  conflict,
  titleByAtcId,
  onReload,
  onDismiss,
}: {
  conflict: ConflictState
  titleByAtcId: Map<string, string>
  onReload: () => void
  onDismiss: () => void
}) {
  return (
    <div
      data-testid="test-reorder-conflict"
      className="flex flex-col gap-3 rounded-3 border border-signal-fail/40 bg-surface-2 p-4"
    >
      <div>
        <div className="mb-1 font-mono text-xs font-semibold uppercase tracking-widest text-signal-fail">
          Reorder blocked
        </div>
        <p className="m-0 text-xs text-fg-3">
          This Test was reordered by someone else
          {conflict.currentVersion != null ? ` (now version ${conflict.currentVersion})` : ''}
          . Your change was not saved. Reload to see the current order, then start over.
        </p>
      </div>

      {conflict.currentChain && conflict.currentChain.length > 0 && (
        <ol data-testid="test-reorder-conflict-chain" className="m-0 flex list-none flex-col gap-1 p-0">
          {conflict.currentChain.map((atcId, i) => (
            <li key={`${atcId}-${i}`} className="flex items-center gap-2 text-xs text-fg-1">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-3 font-mono text-2xs text-fg-3">
                {i + 1}
              </span>
              <span className="min-w-0 truncate">{titleByAtcId.get(atcId) ?? atcId}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" data-testid="test-reorder-conflict-reload" variant="primary" size="sm" onClick={onReload}>
          Reload current order
        </Button>
        <Button type="button" data-testid="test-reorder-conflict-dismiss" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
