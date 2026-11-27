'use client';

import type { CiContextField } from '@lib/runs/ci-context';
import type { UploadPreview, UploadPreviewEntry } from '@lib/runs/ci-upload';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select } from '@components/ui/select';
import { cn } from '@lib/utils';
import * as Dialog from '@radix-ui/react-dialog';
import { gzipSync } from 'fflate';
import { AlertTriangle, ArrowRight, Check, FileText, Minus, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TRANSPORT_MAX_BYTES = 4 * 1024 * 1024;

const SIZE_REJECTION = 'The limit is 10 MB per report. Only JUnit XML (.xml) is accepted. No run was created.';
export const KEY_CONFLICT_MESSAGE = 'A run was already created from this upload with different CI details. They cannot be changed. Reload the runs view to see it.';

export type CiInput = Record<CiContextField, string>;

const EMPTY_CI_INPUT: CiInput = { commit: '', branch: '', pipeline_name: '', pipeline_url: '' };

const CI_INPUTS: { field: CiContextField, label: string, placeholder: string, mono: boolean, testId: string }[] = [
  { field: 'commit', label: 'Commit', placeholder: 'a1b2c3d', mono: true, testId: 'ci-upload-commit' },
  { field: 'branch', label: 'Branch', placeholder: 'feature/checkout-discounts', mono: true, testId: 'ci-upload-branch' },
  { field: 'pipeline_name', label: 'Pipeline name', placeholder: 'nightly-regression', mono: false, testId: 'ci-upload-pipeline-name' },
  { field: 'pipeline_url', label: 'Pipeline URL', placeholder: 'https://ci.acme.dev/p/42', mono: true, testId: 'ci-upload-pipeline-url' },
];

export function ciUploadParams(values: CiInput): Record<string, string> {
  return Object.fromEntries(CI_INPUTS.filter(({ field }) => values[field].trim() !== '').map(({ field }) => [field, values[field]]));
}

function asCiField(field: string | undefined): CiContextField | null {
  return CI_INPUTS.find(input => input.field === field)?.field ?? null;
}

export interface UploadTestOption {
  id: string
  title: string
}

export interface UploadEnvironmentOption {
  id: string
  name: string
}

interface UploadCiResultsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tests: UploadTestOption[]
  environments: UploadEnvironmentOption[]
  onCreated: (runId: string) => void
}

type Step = 'file' | 'map' | 'confirm';

interface Rejection {
  title: string
  fileName: string | null
  message: string
}

interface ApiErrorBody {
  error?: { code?: string, message?: string, details?: { reason?: string, field?: string } }
}

const STEPS: { id: Step, label: string }[] = [
  { id: 'file', label: 'Report' },
  { id: 'map', label: 'Mapping preview' },
  { id: 'confirm', label: 'Confirm' },
];

const RESULT_CHIP: Record<UploadPreviewEntry['outcome'], { status: string, label: string }> = {
  passed: { status: 'pass', label: 'pass' },
  failed: { status: 'fail', label: 'fail' },
  errored: { status: 'fail', label: 'error' },
  skipped: { status: 'blocked', label: 'skipped' },
};

export function formatReportSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function verdictReason(preview: UploadPreview): string {
  if (preview.verdict === 'passed') {
    return 'Every Test step has a passing entry.';
  }
  const parts: string[] = [];
  if (preview.totals.failed > 0) { parts.push(plural(preview.totals.failed, 'failed entry', 'failed entries')); }
  if (preview.totals.skipped > 0) { parts.push(plural(preview.totals.skipped, 'skipped entry', 'skipped entries')); }
  if (preview.totals.gaps > 0) { parts.push(plural(preview.totals.gaps, 'step with no result', 'steps with no result')); }
  return `${parts.join(', ')}. A run is recorded as passed only when every step passed.`;
}

function rejectionTitle(reason: string | undefined): string {
  if (reason === 'file_too_large') { return 'File too large.'; }
  if (reason === 'report_dtd_forbidden') { return 'DTD not accepted.'; }
  if (reason === 'report_no_entries') { return 'No entries to map.'; }
  if (reason === 'report_too_many_entries') { return 'Too many entries.'; }
  if (reason?.startsWith('report_')) { return 'Not a JUnit XML report.'; }
  return 'Upload rejected.';
}

export async function compressReport(file: File): Promise<Blob> {
  const packed = gzipSync(new Uint8Array(await file.arrayBuffer()));
  return new Blob([packed], { type: 'application/gzip' });
}

function uploadUrl(path: string, params: Record<string, string>): string {
  return `${path}?${new URLSearchParams(params).toString()}`;
}

function ResultChip({ entry }: { entry: UploadPreviewEntry }) {
  const chip = RESULT_CHIP[entry.outcome];
  return (
    <span className="status-chip" data-status={chip.status}>
      <span className="dot" data-status={chip.status} />
      {chip.label}
    </span>
  );
}

function MappingChip({ kind }: { kind: 'mapped' | 'unmapped' | 'gap' }) {
  const copy = { mapped: 'mapped', unmapped: 'not mapped', gap: 'coverage gap' }[kind];
  const Icon = kind === 'mapped' ? Check : kind === 'unmapped' ? AlertTriangle : Minus;
  return (
    <span
      data-map={kind}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-1 border px-1.5 py-px text-2xs font-medium',
        kind === 'mapped' && 'border-stroke-2 bg-surface-2 text-fg-2',
        kind === 'unmapped' && 'border-signal-blocked/30 bg-signal-blocked-bg text-signal-blocked',
        kind === 'gap' && 'border-stroke-2 bg-surface-4 text-fg-3',
      )}
    >
      <Icon size={10} aria-hidden="true" />
      {copy}
    </span>
  );
}

function EntryCell({ entry }: { entry: UploadPreviewEntry }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-mono text-xs text-fg-0" title={entry.name}>{entry.name}</span>
      {entry.classname !== '' && <span className="truncate font-mono text-2xs text-fg-3" title={entry.classname}>{entry.classname}</span>}
    </div>
  );
}

const TH = 'whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-1.5 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3';
const TD = 'border-t border-stroke-1 px-3 py-1.5 align-top';

function MappingTable({ preview }: { preview: UploadPreview }) {
  return (
    <div className="overflow-x-auto rounded-2 border border-stroke-2">
      <table className="w-full table-fixed border-collapse" data-testid="ci-upload-mapping">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-8" />
          <col />
          <col className="w-24" />
          <col className="w-32" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>#</th>
            <th scope="col" className={TH}>Report entry</th>
            <th scope="col" className={TH}><span className="sr-only">maps to</span></th>
            <th scope="col" className={TH}>Test step</th>
            <th scope="col" className={TH}>Result</th>
            <th scope="col" className={TH}>Mapping</th>
          </tr>
        </thead>
        <tbody>
          {preview.mapped.map(row => (
            <tr key={`m-${row.position}`} data-testid={`ci-upload-row-${row.position}`}>
              <td className={cn(TD, 'font-mono text-xs text-fg-3')}>{row.entry.index}</td>
              <td className={TD}><EntryCell entry={row.entry} /></td>
              <td className={cn(TD, 'text-fg-4')}><ArrowRight size={12} aria-hidden="true" /></td>
              <td className={TD}>
                <span className="flex min-w-0 items-baseline gap-1.5 text-sm text-fg-1">
                  <span className="shrink-0 font-mono text-2xs text-fg-3">{`S${row.position}`}</span>
                  <span className="truncate" title={row.step_title}>{row.step_title}</span>
                </span>
              </td>
              <td className={TD}><ResultChip entry={row.entry} /></td>
              <td className={TD}><MappingChip kind="mapped" /></td>
            </tr>
          ))}
          {preview.gaps.map(gap => (
            <tr key={`g-${gap.position}`} data-testid={`ci-upload-gap-${gap.position}`} className="bg-surface-1">
              <td className={cn(TD, 'font-mono text-xs text-fg-4')}>-</td>
              <td className={cn(TD, 'text-xs italic text-fg-3')}>No report entry reached this step</td>
              <td className={cn(TD, 'text-fg-4')}><ArrowRight size={12} aria-hidden="true" /></td>
              <td className={TD}>
                <span className="flex min-w-0 items-baseline gap-1.5 text-sm text-fg-2">
                  <span className="shrink-0 font-mono text-2xs text-fg-3">{`S${gap.position}`}</span>
                  <span className="truncate" title={gap.step_title}>{gap.step_title}</span>
                </span>
              </td>
              <td className={TD}>
                <span className="status-chip" data-status="blocked">
                  <span className="dot" data-status="blocked" />
                  blocked
                </span>
              </td>
              <td className={TD}><MappingChip kind="gap" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnmappedTable({ entries }: { entries: UploadPreviewEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-2 border border-stroke-2">
      <table className="w-full table-fixed border-collapse" data-testid="ci-upload-unmapped">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-8" />
          <col />
          <col className="w-24" />
          <col className="w-32" />
        </colgroup>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.index} data-testid={`ci-upload-unmapped-${entry.index}`}>
              <td className={cn(TD, 'font-mono text-xs text-fg-3')}>{entry.index}</td>
              <td className={TD}><EntryCell entry={entry} /></td>
              <td className={cn(TD, 'text-fg-4')}><ArrowRight size={12} aria-hidden="true" /></td>
              <td className={cn(TD, 'text-xs italic text-fg-3')}>No matching step</td>
              <td className={TD}><ResultChip entry={entry} /></td>
              <td className={TD}><MappingChip kind="unmapped" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ value, label, testId }: { value: number, label: string, testId: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-lg font-semibold text-fg-0" data-testid={testId}>{value}</span>
      <span className="text-xs text-fg-3">{label}</span>
    </div>
  );
}

function ConfirmStep({ preview, file }: { preview: UploadPreview, file: File }) {
  const covered = preview.mapped.length;
  const width = (n: number) => `${(n / preview.step_count) * 100}%`;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-2 border border-stroke-2 bg-surface-2 p-4" aria-labelledby="ci-upload-verdict-title">
        <h3 id="ci-upload-verdict-title" className="text-sm font-semibold text-fg-1">Verdict preview</h3>
        <span
          data-testid="ci-upload-verdict"
          data-verdict={preview.verdict}
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-2 border px-2.5 py-1 text-sm font-medium',
            preview.verdict === 'passed' ? 'border-signal-pass/30 bg-signal-pass-bg text-signal-pass' : 'border-signal-fail/30 bg-signal-fail-bg text-signal-fail',
          )}
        >
          {preview.verdict === 'passed' ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
          {`Run will be recorded as ${preview.verdict}`}
        </span>
        <p className="m-0 text-sm text-fg-2" data-testid="ci-upload-verdict-reason">{verdictReason(preview)}</p>
        <div className="grid grid-cols-4 gap-2 border-t border-stroke-1 pt-3">
          <Stat value={preview.entry_count} label="entries" testId="ci-upload-stat-entries" />
          <Stat value={covered} label="mapped" testId="ci-upload-stat-mapped" />
          <Stat value={preview.totals.unmapped} label="not mapped" testId="ci-upload-stat-unmapped" />
          <Stat value={preview.totals.gaps} label="step gaps" testId="ci-upload-stat-gaps" />
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-2 border border-stroke-2 bg-surface-2 p-4" aria-labelledby="ci-upload-coverage-title">
        <h3 id="ci-upload-coverage-title" className="text-sm font-semibold text-fg-1">Coverage</h3>
        <div className="flex items-baseline justify-between text-sm text-fg-2">
          <span>Steps covered</span>
          <span className="font-mono text-fg-0" data-testid="ci-upload-covered">{`${covered} of ${preview.step_count}`}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-4" aria-hidden="true">
          <i className="bg-signal-pass" style={{ width: width(preview.totals.passed) }} />
          <i className="bg-signal-fail" style={{ width: width(preview.totals.failed) }} />
          <i className="bg-signal-blocked" style={{ width: width(preview.totals.skipped) }} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-fg-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="dot" data-status="pass" />
            {`pass ${preview.totals.passed}`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="dot" data-status="fail" />
            {`fail ${preview.totals.failed}`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="dot" data-status="blocked" />
            {`blocked ${preview.totals.skipped + preview.totals.gaps}`}
          </span>
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-stroke-1 pt-3 text-sm">
          <dt className="text-fg-3">Test</dt>
          <dd className="m-0 truncate text-fg-1" title={preview.test.title}>{preview.test.title}</dd>
          <dt className="text-fg-3">Environment</dt>
          <dd className="m-0 text-fg-1">{preview.environment}</dd>
          <dt className="text-fg-3">Report</dt>
          <dd className="m-0 truncate font-mono text-xs text-fg-1" title={file.name}>{`${file.name} · ${formatReportSize(file.size)}`}</dd>
        </dl>
      </section>
    </div>
  );
}

function CiContextSection({ values, invalid, disabled, onChange }: { values: CiInput, invalid: CiContextField | null, disabled: boolean, onChange: (field: CiContextField, value: string) => void }) {
  return (
    <section className="flex flex-col gap-3 rounded-2 border border-stroke-2 bg-surface-2 p-4" aria-labelledby="ci-upload-ci-title" data-testid="ci-upload-ci-context">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 id="ci-upload-ci-title" className="m-0 text-sm font-semibold text-fg-1">CI context</h3>
        <span className="text-xs text-fg-3">Optional</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CI_INPUTS.map(input => (
          <div key={input.field} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`ci-upload-input-${input.field}`} className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">{input.label}</label>
            <Input
              id={`ci-upload-input-${input.field}`}
              data-testid={input.testId}
              type="text"
              value={values[input.field]}
              placeholder={input.placeholder}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid === input.field ? true : undefined}
              aria-describedby={invalid === input.field ? 'ci-upload-create-error' : 'ci-upload-ci-help'}
              className={cn(input.mono && 'font-mono text-xs', invalid === input.field && 'border-signal-fail hover:border-signal-fail')}
              onChange={e => onChange(input.field, e.target.value)}
            />
          </div>
        ))}
      </div>
      <p id="ci-upload-ci-help" className="m-0 text-xs text-fg-3">Saved with the run. They cannot be changed later.</p>
    </section>
  );
}

export function UploadCiResultsDialog({ open, onOpenChange, tests, environments, onCreated }: UploadCiResultsDialogProps) {
  const [step, setStep] = useState<Step>('file');
  const [testId, setTestId] = useState('');
  const [environment, setEnvironment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [payload, setPayload] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [ci, setCi] = useState<CiInput>(EMPTY_CI_INPUT);
  const [ciInvalid, setCiInvalid] = useState<CiContextField | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    setStep('file');
    setFile(null);
    setPayload(null);
    setPreview(null);
    setRejection(null);
    setCreateError(null);
    setAcknowledged(false);
    setBusy(false);
    setCi(EMPTY_CI_INPUT);
    setCiInvalid(null);
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  const runPreview = useCallback(async (nextFile: File, nextTestId: string, nextEnvironment: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setRejection(null);
    try {
      const packed = await compressReport(nextFile);
      if (controller.signal.aborted) { return; }
      if (packed.size > UPLOAD_TRANSPORT_MAX_BYTES) {
        setFile(null);
        setRejection({ title: 'File too large.', fileName: nextFile.name, message: `cannot be sent: even compressed it is ${formatReportSize(packed.size)}. ${SIZE_REJECTION}` });
        return;
      }
      const response = await fetch(uploadUrl('/api/v1/runs/uploads/preview', {
        test_id: nextTestId,
        environment: nextEnvironment,
        file_name: nextFile.name,
      }), {
        method: 'POST',
        headers: { 'content-type': 'application/gzip' },
        body: packed,
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({})) as ApiErrorBody & { preview?: UploadPreview };
      if (controller.signal.aborted) { return; }
      if (!response.ok || !body.preview) {
        setFile(null);
        const tooLarge = response.status === 413;
        setRejection({
          title: tooLarge ? 'File too large.' : rejectionTitle(body.error?.details?.reason),
          fileName: nextFile.name,
          message: body.error?.message ?? (tooLarge ? SIZE_REJECTION : 'The report could not be read.'),
        });
        return;
      }
      setPayload(packed);
      setPreview(body.preview);
      setAcknowledged(false);
      setCreateError(null);
      setCiInvalid(null);
      setIdempotencyKey(crypto.randomUUID());
      setStep('map');
    }
    catch (error) {
      if (controller.signal.aborted) { return; }
      setRejection({ title: 'Upload failed.', fileName: nextFile.name, message: error instanceof Error ? error.message : 'Network error.' });
    }
    finally {
      if (requestRef.current === controller) { setBusy(false); }
    }
  }, []);

  const pick = (files: FileList | null) => {
    if (!files || files.length === 0) { return; }
    if (files.length > 1) {
      setRejection({ title: 'One file per upload.', fileName: null, message: `${files.length} files were dropped. Upload a single JUnit XML report at a time. No run was created.` });
      return;
    }
    const next = files[0];
    if (next.size > UPLOAD_MAX_BYTES) {
      setFile(null);
      setRejection({ title: 'File too large.', fileName: next.name, message: `is ${formatReportSize(next.size)}. ${SIZE_REJECTION}` });
      return;
    }
    setFile(next);
    if (testId !== '' && environment !== '') {
      void runPreview(next, testId, environment);
    }
    else {
      setRejection(null);
    }
  };

  const onPickTest = (value: string) => {
    setTestId(value);
    if (file && value !== '' && environment !== '') { void runPreview(file, value, environment); }
  };

  const onPickEnvironment = (value: string) => {
    setEnvironment(value);
    if (file && testId !== '' && value !== '') { void runPreview(file, testId, value); }
  };

  const create = async () => {
    if (!preview || !file || !payload || busy) { return; }
    setBusy(true);
    setCreateError(null);
    setCiInvalid(null);
    try {
      const response = await fetch(uploadUrl('/api/v1/runs/uploads', {
        test_id: testId,
        environment,
        file_name: file.name,
        acknowledge_unmapped: acknowledged ? 'true' : 'false',
        idempotency_key: idempotencyKey,
        preview_fingerprint: preview.fingerprint,
        ...ciUploadParams(ci),
      }), {
        method: 'POST',
        headers: { 'content-type': 'application/gzip' },
        body: payload,
      });
      const body = await response.json().catch(() => ({})) as ApiErrorBody & { run?: { id?: string } };
      if (!response.ok || !body.run?.id) {
        setCiInvalid(asCiField(body.error?.details?.field));
        setCreateError(body.error?.details?.reason === 'idempotency_key_conflict'
          ? KEY_CONFLICT_MESSAGE
          : body.error?.message ?? 'Could not create the run. Try again: a retry never creates a second run.');
        setBusy(false);
        return;
      }
      toast.success('Run created from the CI report');
      onCreated(body.run.id);
      reset();
      onOpenChange(false);
    }
    catch (error) {
      setCreateError(error instanceof Error ? `${error.message} Try again: a retry never creates a second run.` : 'Network error. Try again: a retry never creates a second run.');
      setBusy(false);
    }
  };

  const needsAck = preview?.requires_acknowledgement === true;
  const canContinue = preview !== null && (!needsAck || acknowledged);
  const stepIndex = STEPS.findIndex(s => s.id === step);
  const chooseHint = testId === '' || environment === '' ? 'Choose a Test and an environment, then add the report.' : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) { reset(); }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          data-testid="ci-upload-dialog"
          data-step={step}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[880px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3 border border-stroke-3 bg-surface-3 shadow-pop"
        >
          <header className="flex items-start gap-3 border-b border-stroke-2 px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <Dialog.Title className="text-lg font-semibold text-fg-0">Upload CI results</Dialog.Title>
              <Dialog.Description className="text-sm text-fg-3">
                Attach a CI report to a Test. The mapping you confirm here is exactly what gets recorded.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm" className="ml-auto" aria-label="Close and discard upload" data-testid="ci-upload-close">
                <X size={14} />
              </Button>
            </Dialog.Close>
          </header>

          <ol className="m-0 flex list-none items-center gap-4 border-b border-stroke-1 px-5 py-2.5 text-xs" data-testid="ci-upload-stepper">
            {STEPS.map((s, i) => {
              const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo';
              return (
                <li key={s.id} data-state={state} aria-current={state === 'active' ? 'step' : undefined} className={cn('inline-flex items-center gap-1.5', state === 'active' ? 'text-fg-0' : state === 'done' ? 'text-fg-2' : 'text-fg-4')}>
                  <span className={cn('flex size-4 items-center justify-center rounded-full border font-mono text-2xs', state === 'active' ? 'border-accent bg-accent text-white' : state === 'done' ? 'border-stroke-3 bg-surface-4 text-fg-1' : 'border-stroke-2 text-fg-4')}>
                    {state === 'done' ? <Check size={9} aria-hidden="true" /> : i + 1}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {step === 'file' && (
              <div className="flex flex-col gap-4" data-testid="ci-upload-step-file">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="ci-upload-test" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">Test</label>
                    <Select id="ci-upload-test" data-testid="ci-upload-test" value={testId} onChange={e => onPickTest(e.target.value)} disabled={busy}>
                      <option value="">Choose a Test…</option>
                      {tests.map(test => <option key={test.id} value={test.id}>{test.title}</option>)}
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="ci-upload-env" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">Environment</label>
                    <Select id="ci-upload-env" data-testid="ci-upload-env" value={environment} onChange={e => onPickEnvironment(e.target.value)} disabled={busy}>
                      <option value="">Environment…</option>
                      {environments.map(env => <option key={env.id} value={env.name}>{env.name}</option>)}
                    </Select>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  data-testid="ci-upload-dropzone"
                  data-dragging={dragging || undefined}
                  aria-label="Drop a JUnit XML report here, or press Enter to browse. One file, 10 megabytes maximum."
                  aria-busy={busy}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pick(e.dataTransfer.files);
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-1.5 rounded-2 border border-dashed px-4 py-8 text-center transition-colors duration-token ease-token focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent',
                    dragging ? 'border-accent bg-accent-glow' : 'border-stroke-3 bg-surface-2 hover:bg-surface-4',
                  )}
                >
                  <Upload size={18} className="text-fg-3" aria-hidden="true" />
                  <span className="text-sm text-fg-1">
                    {busy
                      ? 'Reading the report…'
                      : (
                          <>
                            Drop the CI report here, or
                            <span className="underline underline-offset-2">browse</span>
                          </>
                        )}
                  </span>
                  <span className="font-mono text-2xs text-fg-3">JUnit XML · one file per upload · 10 MB max</span>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  data-testid="ci-upload-input"
                  onChange={(e) => {
                    pick(e.target.files);
                    e.target.value = '';
                  }}
                />

                {file && !rejection && (
                  <div className="flex items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-sm" data-testid="ci-upload-file">
                    <FileText size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
                    <span className="truncate font-mono text-xs text-fg-0">{file.name}</span>
                    <span className="shrink-0 font-mono text-2xs text-fg-3">{formatReportSize(file.size)}</span>
                  </div>
                )}

                <div role="alert" aria-live="assertive">
                  {rejection && (
                    <div data-testid="ci-upload-error" className="flex items-start gap-2 rounded-2 border border-signal-fail/30 bg-signal-fail-bg px-3 py-2 text-sm text-fg-1">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-signal-fail" aria-hidden="true" />
                      <span>
                        <span className="font-semibold">{rejection.title}</span>
                        {' '}
                        {rejection.fileName && <span className="font-mono text-xs">{rejection.fileName}</span>}
                        {' '}
                        {rejection.message}
                      </span>
                    </div>
                  )}
                </div>
                {chooseHint && <p className="m-0 text-xs text-fg-3" data-testid="ci-upload-hint">{chooseHint}</p>}
              </div>
            )}

            {step === 'map' && preview && (
              <div className="flex flex-col gap-3" data-testid="ci-upload-step-map">
                <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
                  <span className="font-medium text-fg-1">{preview.test.title}</span>
                  <span aria-hidden="true" className="h-3 w-px bg-stroke-2" />
                  <span>{`env: ${preview.environment}`}</span>
                  <span aria-hidden="true" className="h-3 w-px bg-stroke-2" />
                  <span className="font-mono">{preview.file_name}</span>
                </div>
                <p className="m-0 text-sm text-fg-2">
                  Report entries are matched to Test steps
                  {' '}
                  <strong className="font-semibold text-fg-1">by position</strong>
                  : entry 1 to step 1, entry 2 to step 2, and so on. This preview is the contract: what you confirm is exactly what gets recorded.
                </p>
                <MappingTable preview={preview} />
                {preview.unmapped.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-baseline gap-2 pt-1">
                      <span className="text-sm font-semibold text-fg-1">Not mapped</span>
                      <span className="font-mono text-xs text-signal-blocked">{plural(preview.unmapped.length, 'report entry', 'report entries')}</span>
                      <span className="text-xs text-fg-3">kept on the run, linked to no step</span>
                    </div>
                    <UnmappedTable entries={preview.unmapped} />
                    <label className="flex items-start gap-2 rounded-2 border border-signal-blocked/30 bg-signal-blocked-bg px-3 py-2 text-sm text-fg-1" htmlFor="ci-upload-ack">
                      <input
                        id="ci-upload-ack"
                        type="checkbox"
                        data-testid="ci-upload-ack"
                        className="mt-0.5 accent-[var(--accent)]"
                        checked={acknowledged}
                        onChange={e => setAcknowledged(e.target.checked)}
                      />
                      <span>
                        <span className="font-semibold">Required before continuing:</span>
                        {` record ${plural(preview.unmapped.length, 'report entry', 'report entries')} as not mapped. They stay on the run for audit but are linked to no Test step.`}
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}

            {step === 'confirm' && preview && file && (
              <div className="flex flex-col gap-3" data-testid="ci-upload-step-confirm">
                <ConfirmStep preview={preview} file={file} />
                <CiContextSection
                  values={ci}
                  invalid={ciInvalid}
                  disabled={busy}
                  onChange={(field, value) => {
                    setCi(prev => ({ ...prev, [field]: value }));
                    if (ciInvalid === field) { setCiInvalid(null); }
                  }}
                />
                <div role="alert" aria-live="assertive">
                  {createError && (
                    <p id="ci-upload-create-error" data-testid="ci-upload-create-error" className="m-0 rounded-2 border border-signal-fail/30 bg-signal-fail-bg px-3 py-2 text-sm text-fg-1">{createError}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <footer className="flex items-center gap-3 border-t border-stroke-2 bg-surface-2 px-5 py-3">
            {step === 'file' && (
              <>
                <span className="text-xs text-fg-3">No run is created until you confirm the mapping in step 3.</span>
                <Button type="button" className="ml-auto" data-testid="ci-upload-browse" disabled={busy} onClick={() => inputRef.current?.click()}>
                  Browse files
                </Button>
              </>
            )}
            {step === 'map' && preview && (
              <>
                <Button type="button" variant="ghost" data-testid="ci-upload-back" onClick={() => { setStep('file'); setPreview(null); setFile(null); }}>Back</Button>
                <span className="text-xs text-fg-3" data-testid="ci-upload-map-note">
                  {needsAck && !acknowledged
                    ? 'Acknowledge the unmapped entries to enable Continue'
                    : `${preview.mapped.length} of ${preview.entry_count} entries mapped · ${preview.mapped.length} of ${preview.step_count} steps covered`}
                </span>
                <Button type="button" variant="primary" className="ml-auto" data-testid="ci-upload-continue" disabled={!canContinue} onClick={() => setStep('confirm')}>
                  Continue to confirm
                </Button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <Button type="button" variant="ghost" data-testid="ci-upload-back-to-map" disabled={busy} onClick={() => setStep('map')}>Back</Button>
                <span className="text-xs text-fg-3">Creating the run records every entry shown in the preview, including the ones marked not mapped.</span>
                <Button type="button" variant="primary" className="ml-auto" data-testid="ci-upload-create" disabled={busy} onClick={() => { void create(); }}>
                  {busy ? 'Creating…' : 'Create run'}
                </Button>
              </>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
