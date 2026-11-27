import type { UploadChainStep } from './ci-upload';
import type { JunitEntry, JunitReport } from './junit-report';
import { describe, expect, it } from 'bun:test';
import { buildUploadPreview, toUploadSubmission, uploadFingerprint } from './ci-upload';

const TEST = { id: '11111111-1111-4111-8111-111111111111', title: 'Checkout happy path' };

function chain(n: number): UploadChainStep[] {
  return Array.from({ length: n }, (_, i) => ({ position: i + 1, atcId: `atc-${i + 1}`, title: `Step ${i + 1}` }));
}

function entry(index: number, result: JunitEntry['result'] = 'pass', message: string | null = null): JunitEntry {
  const outcome = result === 'pass' ? 'passed' : result === 'fail' ? 'failed' : 'skipped';
  return { index, name: `case ${index}`, classname: 'suite', result, outcome, message, timeSeconds: 1 };
}

function report(entries: JunitEntry[]): JunitReport {
  return { entries, durationSeconds: entries.length };
}

function preview(steps: number, entries: JunitEntry[]) {
  return buildUploadPreview({ test: TEST, environment: 'Staging', fileName: 'junit.xml', chain: chain(steps), report: report(entries) });
}

describe('buildUploadPreview', () => {
  it('maps entry i to step i and passes a fully passing mapping (Scenario 1.1, 2.2)', () => {
    const p = preview(4, [1, 2, 3, 4].map(i => entry(i)));
    expect(p.mapped.map(row => [row.position, row.entry.index, row.step_title])).toEqual([[1, 1, 'Step 1'], [2, 2, 'Step 2'], [3, 3, 'Step 3'], [4, 4, 'Step 4']]);
    expect(p.gaps).toEqual([]);
    expect(p.unmapped).toEqual([]);
    expect(p.verdict).toBe('passed');
    expect(p.requires_acknowledgement).toBe(false);
    expect(p.totals).toEqual({ passed: 4, failed: 0, skipped: 0, gaps: 0, unmapped: 0 });
  });

  it('lists trailing entries as unmapped and requires acknowledgement (Scenario 2.1)', () => {
    const p = preview(4, [1, 2, 3, 4, 5, 6].map(i => entry(i)));
    expect(p.unmapped.map(e => e.name)).toEqual(['case 5', 'case 6']);
    expect(p.requires_acknowledgement).toBe(true);
    expect(p.totals.unmapped).toBe(2);
    expect(p.verdict).toBe('passed');
  });

  it('flags uncovered steps as gaps and fails the verdict (Scenario 3.1)', () => {
    const p = preview(4, [entry(1), entry(2)]);
    expect(p.gaps.map(g => g.position)).toEqual([3, 4]);
    expect(p.verdict).toBe('failed');
    expect(p.totals.gaps).toBe(2);
  });

  it('fails the run on one failing entry (Scenario 5.1) and on a skipped entry (Scenario 5.2)', () => {
    expect(preview(3, [entry(1), entry(2, 'fail', 'Failure: boom'), entry(3)]).verdict).toBe('failed');
    const skipped = preview(2, [entry(1), entry(2, 'block', 'Skipped')]);
    expect(skipped.verdict).toBe('failed');
    expect(skipped.totals).toMatchObject({ passed: 1, failed: 0, skipped: 1 });
  });

  it('changes its fingerprint when the chain or the report changes', () => {
    const entries = [entry(1), entry(2)];
    const base = uploadFingerprint(TEST.id, chain(2), entries);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(uploadFingerprint(TEST.id, chain(2), entries)).toBe(base);
    expect(uploadFingerprint(TEST.id, chain(3), entries)).not.toBe(base);
    expect(uploadFingerprint(TEST.id, chain(2), [entry(1), entry(2, 'fail')])).not.toBe(base);
  });
});

describe('toUploadSubmission', () => {
  it('gives every chain step a result, blocks the gaps and keeps messages and unmapped entries', () => {
    const p = preview(3, [entry(1, 'fail', 'Failure: expected 200'), entry(2)]);
    const submission = toUploadSubmission(p);
    expect(submission.steps).toEqual([{ position: 1, result: 'fail' }, { position: 2, result: 'pass' }, { position: 3, result: 'block' }]);
    expect(submission.verdict).toBe('failed');
    expect(submission.stepNotes).toEqual({ 1: 'Failure: expected 200' });
    expect(submission.report).toEqual({ file_name: 'junit.xml', entry_count: 2, unmapped: [] });
    expect(submission.durationSeconds).toBe(2);
  });

  it('records unmapped entries by index, name, class name and result', () => {
    const submission = toUploadSubmission(preview(1, [entry(1), entry(2, 'fail')]));
    expect(submission.report.unmapped).toEqual([{ index: 2, name: 'case 2', classname: 'suite', result: 'fail' }]);
  });
});
