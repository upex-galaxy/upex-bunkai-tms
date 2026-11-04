'use client';

import type { ArchivedAtcSource } from '@lib/atcs/library';
import type { AcceptanceCriterion, Atc, AtcAssertion, AtcStep, AtcUsageReport, Module, UserStory } from '@lib/types';
import { useWorkbench } from '@app/(app)/projects/[projectSlug]/workbench-context';
import { AtcPreview } from '@components/atcs/AtcPreview';
import { Button } from '@components/ui/button';
import { formatActivityTime } from '@lib/activity/view';
import { assertionsToYaml, stepsToMarkdown } from '@lib/atc-parse';
import { restoreAtc } from '@lib/atcs/archive-client';
import { RESTORE_FAILURE_COPY, restoreToastMessage } from '@lib/atcs/restore-copy';
import { shortSlug } from '@lib/utils';
import { Archive, ArchiveRestore, ChevronLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

// BK-571 — an archived ATC, read-only. Same topbar grammar as `AtcEditor`, the
// existing `AtcPreview` as the body, and no input, Save, Duplicate or Archive:
// the database refuses every edit of an archived ATC (named `atc_archived`), so
// the screen offers none. Restore is offered only for an ATC archived on its own
// and only to someone who can write; one a Module or User Story archived comes
// back with that parent.

export const ATC_ARCHIVED_BANNER_COPY = 'This ATC is archived. It is read-only until it is restored.';

interface ArchivedAtcDetailProps {
  atc: Atc
  module: Module | null
  modulePath: string
  story: UserStory | null
  acs: AcceptanceCriterion[]
  steps: AtcStep[]
  assertions: AtcAssertion[]
  projectSlug: string
  source: ArchivedAtcSource
  // Module name or User Story label the cascade came from; null for an own archive.
  parentName: string | null
  archivedByLabel: string
  usage: AtcUsageReport
}

export function ArchivedAtcDetail({
  atc,
  module,
  modulePath,
  story,
  acs,
  steps,
  assertions,
  projectSlug,
  source,
  parentName,
  archivedByLabel,
  usage,
}: ArchivedAtcDetailProps) {
  const router = useRouter();
  const { canCreate } = useWorkbench();
  const [restoring, setRestoring] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const stepsMd = useMemo(() => stepsToMarkdown(steps), [steps]);
  const assertionsYaml = useMemo(() => assertionsToYaml(assertions), [assertions]);
  const moduleSegments = useMemo(() => modulePath.split('/'), [modulePath]);
  const atcCode = shortSlug(atc.slug);
  const archivedAt = atc.archived_at === null ? null : formatActivityTime(atc.archived_at);
  const canRestore = canCreate && source === 'own';

  const restore = async () => {
    if (restoring) { return; }
    setRestoring(true);
    setFailure(null);
    const result = await restoreAtc(atc.id);
    setRestoring(false);
    if (!result.ok) {
      setFailure(result.errorMessage);
      return;
    }
    toast.success(restoreToastMessage(result.title ?? atc.title, result.heldByParent));
    router.refresh();
  };

  const parentKind = source === 'user_story' ? 'User Story' : 'Module';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-0">
      <div className="flex h-10 flex-shrink-0 items-center justify-between gap-3 border-b border-stroke-1 bg-surface-1 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/projects/${projectSlug}`}
            aria-label="Back to the project"
            className="inline-flex size-7 items-center justify-center rounded-2 border border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0"
          >
            <ChevronLeft size={13} />
          </Link>
          <span
            data-testid="atc-editor-code"
            title={`${atc.slug} · ${atc.id}`}
            className="flex-shrink-0 whitespace-nowrap font-mono text-xs font-semibold text-fg-0"
          >
            {atcCode}
          </span>
          <span className="status-chip flex-shrink-0" data-status="skipped" data-testid="atc-archived-badge">Archived</span>
          <span className="min-w-0 truncate whitespace-nowrap text-sm text-fg-2" title={module ? `in ${module.name}` : undefined}>
            {module ? `in ${module.name}` : 'archived'}
          </span>
          <span className="ml-2 hidden min-w-0 truncate whitespace-nowrap text-xs text-fg-3 lg:inline" title={moduleSegments.join(' / ')}>
            ·
            {' '}
            {moduleSegments.join(' / ')}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {canRestore && (
            <Button
              size="sm"
              variant="primary"
              data-testid="atc-detail-restore"
              onClick={() => { void restore(); }}
              disabled={restoring}
            >
              {failure !== null && !restoring ? <RefreshCw size={11} /> : <ArchiveRestore size={11} />}
              {restoring ? 'Restoring…' : failure !== null ? 'Retry restore' : 'Restore'}
            </Button>
          )}
        </div>
      </div>

      <div
        role="status"
        data-testid="atc-archived-banner"
        className="flex flex-shrink-0 items-start gap-2 border-b border-stroke-1 bg-surface-2 px-4 py-2.5 text-sm text-fg-1"
      >
        <Archive size={14} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="m-0 font-semibold text-fg-0">{ATC_ARCHIVED_BANNER_COPY}</p>
          {source === 'own'
            ? (
                <p className="m-0 text-xs text-fg-2" data-testid="atc-archived-banner-detail">
                  {`Archived by ${archivedByLabel}${archivedAt ? ` · ${archivedAt}` : ''}`}
                </p>
              )
            : (
                <p className="m-0 text-xs text-fg-2" data-testid="atc-archived-banner-detail">
                  {`Archived with its ${parentKind} "${parentName ?? '—'}". It comes back when that parent is restored.`}
                  {archivedAt ? ` · ${archivedAt}` : ''}
                </p>
              )}
          {failure !== null && (
            <p role="alert" data-testid="atc-detail-restore-error" className="m-0 mt-1 text-xs text-signal-fail">
              <span className="font-semibold">{RESTORE_FAILURE_COPY}</span>
              {' '}
              <span className="font-mono text-fg-3">{failure}</span>
            </p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto h-full max-w-[820px] border-x border-stroke-1">
          <AtcPreview
            id={atc.id}
            status={atc.status}
            layer={atc.layer}
            technique={atc.technique}
            priority={atc.priority}
            breadcrumb={moduleSegments}
            title={atc.title}
            story={story}
            acs={acs}
            stepsMd={stepsMd}
            assertionsYaml={assertionsYaml}
            tags={atc.tags}
            archivedUsage={usage}
          />
        </div>
      </div>
    </div>
  );
}
