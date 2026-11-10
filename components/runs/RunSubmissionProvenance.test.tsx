import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunSubmissionProvenance } from './RunSubmissionProvenance';

// BK-222 AC-1 — the finished-run detail shows the token name and the evidence
// links of a submitted run, and nothing at all for a manual run. Server render,
// so this is NOT live-UI evidence (that is the browser pass).

describe('RunSubmissionProvenance', () => {
  it('shows the reporter and the evidence links, opening in a new tab safely', () => {
    const html = renderToStaticMarkup(
      <RunSubmissionProvenance
        executorName="ci-bot"
        evidenceUrls={['https://ci.example.com/run/1', 'http://logs.example.com/a']}
      />,
    );
    expect(html).toContain('Reported by');
    expect(html).toContain('ci-bot');
    expect(html).toContain('href="https://ci.example.com/run/1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders nothing for a run started by hand', () => {
    expect(renderToStaticMarkup(<RunSubmissionProvenance executorName={null} evidenceUrls={[]} />)).toBe('');
    expect(renderToStaticMarkup(<RunSubmissionProvenance executorName={undefined} evidenceUrls={undefined} />)).toBe('');
  });

  it('never renders a non-http link (defence in depth)', () => {
    const html = renderToStaticMarkup(
      <RunSubmissionProvenance executorName="ci-bot" evidenceUrls={['javascript:alert(1)', 'https://ok.example.com']} />,
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('https://ok.example.com');
  });

  it('shows the reporter alone when no evidence was attached', () => {
    const html = renderToStaticMarkup(<RunSubmissionProvenance executorName="ci-bot" evidenceUrls={[]} />);
    expect(html).toContain('ci-bot');
    expect(html).not.toContain('Evidence');
  });

  it('BK-223 — prefixes the token name with the executor mode', () => {
    const agent = renderToStaticMarkup(<RunSubmissionProvenance executorName="karim" evidenceUrls={[]} executorMode="agent" />);
    expect(agent).toContain('Agent — karim');
    const ci = renderToStaticMarkup(<RunSubmissionProvenance executorName="pipeline" evidenceUrls={[]} executorMode="ci" />);
    expect(ci).toContain('CI — pipeline');
  });

  it('BK-223 — shows the waiting state until the first step is reported', () => {
    const waiting = renderToStaticMarkup(
      <RunSubmissionProvenance executorName="karim" evidenceUrls={[]} executorMode="agent" waitingForFirstResult />,
    );
    expect(waiting).toContain('Waiting for first result');
    const reported = renderToStaticMarkup(
      <RunSubmissionProvenance executorName="karim" evidenceUrls={[]} executorMode="agent" waitingForFirstResult={false} />,
    );
    expect(reported).not.toContain('Waiting for first result');
  });
});
