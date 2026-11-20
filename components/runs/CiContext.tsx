import type { RunCiFields } from '@lib/runs/ci-link';
import { commitUrl, hasCiContext, pipelineHref, REPOSITORY_HINT_ADMIN, repositoryHint, shortCommit } from '@lib/runs/ci-link';
import { ExternalLink, GitBranch, GitCommitHorizontal, Info, Workflow } from 'lucide-react';
import Link from 'next/link';

const CHIP = 'inline-flex max-w-full min-w-0 items-center gap-1 rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-1';
const LINK_CHIP = `${CHIP} hover:border-stroke-3 hover:bg-surface-3 hover:text-fg-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent`;

export function BranchChip({ branch, testId }: { branch: string, testId?: string }) {
  return (
    <span data-testid={testId ?? 'ci-branch'} className={CHIP} title={branch}>
      <GitBranch size={11} aria-hidden="true" className="shrink-0 text-fg-3" />
      <span className="truncate">{branch}</span>
    </span>
  );
}

export function CommitRef({ commit, repositoryUrl, testId }: { commit: string, repositoryUrl: string | null, testId?: string }) {
  const href = commitUrl(repositoryUrl, commit);
  const content = (
    <>
      <GitCommitHorizontal size={11} aria-hidden="true" className="shrink-0 text-fg-3" />
      {shortCommit(commit)}
    </>
  );
  if (href === null) {
    return (
      <span data-testid={testId ?? 'ci-commit'} data-linked="false" className={CHIP} title={commit}>
        {content}
      </span>
    );
  }
  return (
    <a
      data-testid={testId ?? 'ci-commit'}
      data-linked="true"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={commit}
      aria-label={`Commit ${commit} (opens in a new tab)`}
      className={LINK_CHIP}
    >
      {content}
      <ExternalLink size={10} aria-hidden="true" className="shrink-0 text-fg-3" />
    </a>
  );
}

function PipelineRef({ name, url }: { name: string | null | undefined, url: string | null | undefined }) {
  const href = pipelineHref(url);
  if (!name && href === null) {
    return null;
  }
  const label = name ?? 'Pipeline';
  const content = (
    <>
      <Workflow size={11} aria-hidden="true" className="shrink-0 text-fg-3" />
      <span className="truncate">{label}</span>
    </>
  );
  if (href === null) {
    return <span data-testid="ci-pipeline" data-linked="false" className={CHIP} title={label}>{content}</span>;
  }
  return (
    <a
      data-testid="ci-pipeline"
      data-linked="true"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      aria-label={`Pipeline ${label} (opens in a new tab)`}
      className={LINK_CHIP}
    >
      {content}
      <ExternalLink size={10} aria-hidden="true" className="shrink-0 text-fg-3" />
    </a>
  );
}

function RepositoryHint({ canConfigure, settingsHref }: { canConfigure: boolean, settingsHref: string }) {
  if (!canConfigure) {
    return (
      <span data-testid="ci-repository-hint" className="inline-flex items-center gap-1 text-2xs text-fg-3">
        <Info size={11} aria-hidden="true" className="shrink-0" />
        {repositoryHint(false)}
      </span>
    );
  }
  const [before, after] = REPOSITORY_HINT_ADMIN.split('Project settings');
  return (
    <span data-testid="ci-repository-hint" className="inline-flex items-center gap-1 text-2xs text-fg-3">
      <Info size={11} aria-hidden="true" className="shrink-0" />
      <span>
        {before}
        <Link href={settingsHref} className="text-accent underline-offset-2 hover:underline">Project settings</Link>
        {after}
      </span>
    </span>
  );
}

interface CiContextRowProps {
  run: RunCiFields
  repositoryUrl: string | null
  canConfigureRepository: boolean
  settingsHref: string
}

export function CiContextRow({ run, repositoryUrl, canConfigureRepository, settingsHref }: CiContextRowProps) {
  if (!hasCiContext(run)) {
    return null;
  }
  return (
    <div className="flex flex-shrink-0 items-center border-b border-stroke-1 px-4 py-1.5">
      <div data-testid="runner-ci-context" className="mx-auto flex w-full max-w-[820px] flex-wrap items-center gap-2">
        <span className="shrink-0 font-mono text-2xs font-medium uppercase tracking-wider text-fg-3">CI context</span>
        {run.branch && <BranchChip branch={run.branch} />}
        {run.commit && <CommitRef commit={run.commit} repositoryUrl={repositoryUrl} />}
        {run.commit && repositoryUrl === null && <RepositoryHint canConfigure={canConfigureRepository} settingsHref={settingsHref} />}
        <PipelineRef name={run.pipeline_name} url={run.pipeline_url} />
      </div>
    </div>
  );
}

export function CiRefs({ run, repositoryUrl, testIdPrefix }: { run: RunCiFields, repositoryUrl: string | null, testIdPrefix: string }) {
  if (!run.branch && !run.commit) {
    return null;
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      {run.branch && <BranchChip branch={run.branch} testId={`${testIdPrefix}-branch`} />}
      {run.commit && <CommitRef commit={run.commit} repositoryUrl={repositoryUrl} testId={`${testIdPrefix}-commit`} />}
    </span>
  );
}
