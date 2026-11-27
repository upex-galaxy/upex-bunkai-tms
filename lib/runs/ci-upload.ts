import type { JunitEntry, JunitOutcome, JunitReport, JunitResult } from '@lib/runs/junit-report';
import { createHash } from 'node:crypto';

export interface UploadChainStep {
  position: number
  atcId: string
  title: string
}

export interface UploadPreviewEntry {
  index: number
  name: string
  classname: string
  result: JunitResult
  outcome: JunitOutcome
  message: string | null
}

export interface UploadPreview {
  test: { id: string, title: string }
  environment: string
  file_name: string
  entry_count: number
  step_count: number
  mapped: { position: number, step_title: string, entry: UploadPreviewEntry }[]
  gaps: { position: number, step_title: string }[]
  unmapped: UploadPreviewEntry[]
  verdict: 'passed' | 'failed'
  totals: { passed: number, failed: number, skipped: number, gaps: number, unmapped: number }
  duration_seconds: number
  requires_acknowledgement: boolean
  fingerprint: string
}

export interface UploadSubmission {
  verdict: 'passed' | 'failed'
  durationSeconds: number
  steps: { position: number, result: JunitResult }[]
  stepNotes: Record<string, string>
  report: {
    file_name: string
    entry_count: number
    unmapped: { index: number, name: string, classname: string, result: JunitResult }[]
  }
}

interface PreviewInput {
  test: { id: string, title: string }
  environment: string
  fileName: string
  chain: UploadChainStep[]
  report: JunitReport
}

function previewEntry(entry: JunitEntry): UploadPreviewEntry {
  return {
    index: entry.index,
    name: entry.name,
    classname: entry.classname,
    result: entry.result,
    outcome: entry.outcome,
    message: entry.message,
  };
}

export function uploadFingerprint(testId: string, chain: UploadChainStep[], entries: JunitEntry[]): string {
  const canonical = JSON.stringify({
    test_id: testId,
    chain: chain.map(step => step.atcId),
    entries: entries.map(entry => [entry.name, entry.classname, entry.result, entry.message]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function buildUploadPreview({ test, environment, fileName, chain, report }: PreviewInput): UploadPreview {
  const { entries } = report;
  const covered = Math.min(chain.length, entries.length);
  const mapped = chain.slice(0, covered).map((step, i) => ({
    position: step.position,
    step_title: step.title,
    entry: previewEntry(entries[i]),
  }));
  const gaps = chain.slice(covered).map(step => ({ position: step.position, step_title: step.title }));
  const unmapped = entries.slice(covered).map(previewEntry);

  const passed = mapped.filter(row => row.entry.result === 'pass').length;
  const failed = mapped.filter(row => row.entry.result === 'fail').length;
  const skipped = mapped.filter(row => row.entry.result === 'block').length;

  return {
    test,
    environment,
    file_name: fileName,
    entry_count: entries.length,
    step_count: chain.length,
    mapped,
    gaps,
    unmapped,
    verdict: passed === chain.length ? 'passed' : 'failed',
    totals: { passed, failed, skipped, gaps: gaps.length, unmapped: unmapped.length },
    duration_seconds: report.durationSeconds,
    requires_acknowledgement: unmapped.length > 0,
    fingerprint: uploadFingerprint(test.id, chain, entries),
  };
}

export function toUploadSubmission(preview: UploadPreview): UploadSubmission {
  const stepNotes: Record<string, string> = {};
  for (const row of preview.mapped) {
    if (row.entry.message) {
      stepNotes[String(row.position)] = row.entry.message;
    }
  }
  return {
    verdict: preview.verdict,
    durationSeconds: preview.duration_seconds,
    steps: [
      ...preview.mapped.map(row => ({ position: row.position, result: row.entry.result })),
      ...preview.gaps.map(gap => ({ position: gap.position, result: 'block' as const })),
    ],
    stepNotes,
    report: {
      file_name: preview.file_name,
      entry_count: preview.entry_count,
      unmapped: preview.unmapped.map(entry => ({
        index: entry.index,
        name: entry.name,
        classname: entry.classname,
        result: entry.result,
      })),
    },
  };
}
