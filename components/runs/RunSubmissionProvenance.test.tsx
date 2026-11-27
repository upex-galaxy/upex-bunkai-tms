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
  it('BK-226: shows the CI report and lists the entries linked to no step as text', () => {
    const html = renderToStaticMarkup(
      <RunSubmissionProvenance
        executorName={null}
        evidenceUrls={[]}
        report={{ file_name: 'junit.xml', entry_count: 6, unmapped_count: 2, unmapped: [
          { index: 5, name: '<b>telemetry</b>', classname: 'extra', result: 'pass' },
          { index: 6, name: 'cleanup', classname: '', result: 'block' },
        ] }}
      />,
    );
    expect(html).toContain('CI report');
    expect(html).toContain('junit.xml');
    expect(html).toContain(' · 6 entries · 2 not mapped');
    expect(html).toContain('#5 &lt;b&gt;telemetry&lt;/b&gt; (extra) · pass');
    expect(html).toContain('#6 cleanup · block');
    expect(html).not.toContain('<b>telemetry');
  });

  it('BK-226: a fully mapped report shows the counts without the list', () => {
    const html = renderToStaticMarkup(
      <RunSubmissionProvenance executorName={null} evidenceUrls={[]} report={{ file_name: 'junit.xml', entry_count: 1, unmapped_count: 0, unmapped: [] }} />,
    );
    expect(html).toContain('1 entry · 0 not mapped');
    expect(html).not.toContain('runner-ci-report-unmapped');
  });
});
