import type { StepMarkStatus } from '@lib/runs/mark-step-view';

export interface CursorStep {
  id: string
  status: string
}

export interface CursorAtc<S extends CursorStep = CursorStep> {
  steps: S[]
}

export type RunnerShortcut
  = | { kind: 'verdict', status: StepMarkStatus }
    | { kind: 'move', direction: 'next' | 'previous' }
    | { kind: 'advance' }
    | { kind: 'report-bug' };

export interface ShortcutKeyEvent {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
  isComposing?: boolean
  keyCode?: number
}

export const REPORT_BUG_NOT_FAILED_MESSAGE = 'A bug is filed from a failed step.';
export const REPORT_BUG_NOT_ALLOWED_MESSAGE = 'You cannot report bugs on this project.';
export const MARK_NOT_ALLOWED_MESSAGE = 'You cannot record step results on this run.';

const VERDICT_BY_CODE: Record<string, StepMarkStatus> = {
  KeyP: 'passed',
  KeyF: 'failed',
  KeyB: 'blocked',
};

const SEVERITY_INDEX_BY_CODE: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
};

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'range', 'color']);

export function runStepOrder<S extends CursorStep>(atcs: CursorAtc<S>[]): S[] {
  return atcs.flatMap(atc => atc.steps);
}

export function initialCursorStepId(order: CursorStep[]): string | null {
  return (order.find(step => step.status === 'pending') ?? order[0])?.id ?? null;
}

export function adjacentStepId(order: CursorStep[], stepId: string, direction: 'next' | 'previous'): string | null {
  const index = order.findIndex(step => step.id === stepId);
  if (index < 0) { return null; }
  const target = order[direction === 'next' ? index + 1 : index - 1];
  return target?.id ?? null;
}

export function isMacPlatform(nav: { platform?: string, userAgent?: string } | undefined): boolean {
  if (!nav) { return false; }
  return /Mac|iPhone|iPad|iPod/.test(nav.platform || nav.userAgent || '');
}

function isComposing(event: ShortcutKeyEvent): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

export function resolveRunnerShortcut(event: ShortcutKeyEvent, isMac: boolean): RunnerShortcut | null {
  if (isComposing(event)) { return null; }

  const primary = isMac ? event.metaKey : event.ctrlKey;
  const secondary = isMac ? event.ctrlKey : event.metaKey;
  if (primary) {
    if (secondary || event.altKey || event.shiftKey || event.repeat) { return null; }
    if (event.code === 'Enter' || event.code === 'NumpadEnter') { return { kind: 'advance' }; }
    if (event.code === 'KeyB') { return { kind: 'report-bug' }; }
    return null;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) { return null; }
  if (event.code === 'ArrowDown') { return { kind: 'move', direction: 'next' }; }
  if (event.code === 'ArrowUp') { return { kind: 'move', direction: 'previous' }; }

  const verdict = VERDICT_BY_CODE[event.code];
  if (verdict && !event.repeat) { return { kind: 'verdict', status: verdict }; }
  return null;
}

export function isCommitChord(event: ShortcutKeyEvent, isMac: boolean): boolean {
  return resolveRunnerShortcut(event, isMac)?.kind === 'advance';
}

export function resolveSeverityShortcut(event: ShortcutKeyEvent): number | null {
  if (isComposing(event) || event.metaKey || event.ctrlKey || event.altKey || event.repeat) { return null; }
  return SEVERITY_INDEX_BY_CODE[event.code] ?? null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') { return false; }
  const element = target as HTMLElement;
  const tag = element.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') { return true; }
  if (tag === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.has(((element as HTMLInputElement).type || 'text').toLowerCase());
  }
  if (element.isContentEditable) { return true; }
  return typeof element.closest === 'function' && element.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

export function isModalOverlayOpen(root: Pick<Document, 'querySelector'>): boolean {
  return root.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null;
}
