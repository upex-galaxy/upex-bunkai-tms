import { isHttpUrl } from '@lib/runs/evidence-url';

// BK-222 — who reported a submitted run and the evidence links they attached.
// Renders nothing for a run started by hand (no executor name, no evidence), so
// the existing Run detail is byte-for-byte unchanged for those. Banner chrome
// mirrors the abort-reason / final-verdict blocks in RunnerView. Links are
// re-checked as http(s) here too: the database stores them verbatim, and an
// `href` is the one place a stray scheme would become executable.
interface RunSubmissionProvenanceProps {
  executorName: string | null | undefined
  evidenceUrls: string[] | null | undefined
  // BK-223 — an agent run reads "Agent — <token name>", a CI run "CI — <name>".
  executorMode?: string | null
  // BK-223 — a streamed run that has not reported a step yet.
  waitingForFirstResult?: boolean
}

const MODE_PREFIX: Record<string, string> = { agent: 'Agent — ', ci: 'CI — ' };

export function RunSubmissionProvenance({ executorName, evidenceUrls, executorMode, waitingForFirstResult }: RunSubmissionProvenanceProps) {
  const links = (evidenceUrls ?? []).filter(isHttpUrl);
  if (!executorName && links.length === 0 && !waitingForFirstResult) {
    return null;
  }
  return (
    <div className="flex flex-shrink-0 items-start border-b border-stroke-1 bg-surface-2 px-4 py-2">
      <div
        data-testid="runner-submission-provenance"
        className="mx-auto flex w-full max-w-[820px] flex-col gap-1"
      >
        {executorName && (
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-mono text-2xs font-medium uppercase tracking-wider text-fg-3">
              Reported by
            </span>
            <span data-testid="runner-reported-by" className="min-w-0 break-words text-xs font-medium text-fg-1">
              {`${MODE_PREFIX[executorMode ?? ''] ?? ''}${executorName}`}
            </span>
          </div>
        )}
        {waitingForFirstResult && (
          <p data-testid="runner-waiting-first-result" className="text-xs text-fg-3">
            Waiting for first result
          </p>
        )}
        {links.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-mono text-2xs font-medium uppercase tracking-wider text-fg-3">
              Evidence
            </span>
            <ul data-testid="runner-evidence-links" className="flex min-w-0 flex-col gap-0.5">
              {links.map(url => (
                <li key={url} className="min-w-0 truncate text-xs">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
