import type { ShortcutKeyEvent } from './runner-keyboard';
import { describe, expect, it } from 'bun:test';
import {
  adjacentStepId,
  initialCursorStepId,
  isCommitChord,
  isEditableTarget,
  isMacPlatform,
  isModalOverlayOpen,
  resolveRunnerShortcut,
  resolveSeverityShortcut,
  runStepOrder,
} from './runner-keyboard';

function key(code: string, overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return { code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, ...overrides };
}

const atcs = [
  { steps: [{ id: 'a1', status: 'passed' }, { id: 'a2', status: 'pending' }, { id: 'a3', status: 'pending' }] },
  { steps: [{ id: 'b1', status: 'pending' }, { id: 'b2', status: 'pending' }, { id: 'b3', status: 'pending' }] },
];

describe('cursor order', () => {
  it('orders every step across ATCs in document order', () => {
    expect(runStepOrder(atcs).map(s => s.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
  });

  it('starts on the first unrun step, on the first step when nothing is unrun, and nowhere on an empty Run', () => {
    expect(initialCursorStepId(runStepOrder(atcs))).toBe('a2');
    expect(initialCursorStepId([{ id: 'x', status: 'passed' }, { id: 'y', status: 'failed' }])).toBe('x');
    expect(initialCursorStepId([])).toBeNull();
  });

  it('crosses an ATC boundary and never wraps at either end', () => {
    const order = runStepOrder(atcs);
    expect(adjacentStepId(order, 'a3', 'next')).toBe('b1');
    expect(adjacentStepId(order, 'b1', 'previous')).toBe('a3');
    expect(adjacentStepId(order, 'b3', 'next')).toBeNull();
    expect(adjacentStepId(order, 'a1', 'previous')).toBeNull();
    expect(adjacentStepId(order, 'missing', 'next')).toBeNull();
  });
});

describe('resolveRunnerShortcut', () => {
  it('reads the verdict keys by physical position, whatever character the layout produces', () => {
    expect(resolveRunnerShortcut(key('KeyP'), false)).toEqual({ kind: 'verdict', status: 'passed' });
    expect(resolveRunnerShortcut(key('KeyF'), false)).toEqual({ kind: 'verdict', status: 'failed' });
    expect(resolveRunnerShortcut(key('KeyB'), true)).toEqual({ kind: 'verdict', status: 'blocked' });
  });

  it('leaves Cmd+P, Ctrl+F and Alt+B to the browser', () => {
    expect(resolveRunnerShortcut(key('KeyP', { metaKey: true }), true)).toBeNull();
    expect(resolveRunnerShortcut(key('KeyF', { ctrlKey: true }), false)).toBeNull();
    expect(resolveRunnerShortcut(key('KeyB', { altKey: true }), false)).toBeNull();
    expect(resolveRunnerShortcut(key('KeyP', { ctrlKey: true }), true)).toBeNull();
  });

  it('maps the platform modifier: Cmd on macOS, Ctrl elsewhere', () => {
    expect(resolveRunnerShortcut(key('Enter', { metaKey: true }), true)).toEqual({ kind: 'advance' });
    expect(resolveRunnerShortcut(key('Enter', { ctrlKey: true }), false)).toEqual({ kind: 'advance' });
    expect(resolveRunnerShortcut(key('NumpadEnter', { ctrlKey: true }), false)).toEqual({ kind: 'advance' });
    expect(resolveRunnerShortcut(key('Enter', { ctrlKey: true }), true)).toBeNull();
    expect(resolveRunnerShortcut(key('KeyB', { metaKey: true }), true)).toEqual({ kind: 'report-bug' });
    expect(resolveRunnerShortcut(key('KeyB', { ctrlKey: true }), false)).toEqual({ kind: 'report-bug' });
    expect(resolveRunnerShortcut(key('KeyB', { metaKey: true, shiftKey: true }), true)).toBeNull();
  });

  it('never advances on a bare Enter', () => {
    expect(resolveRunnerShortcut(key('Enter'), false)).toBeNull();
  });

  it('ignores input-method composition and auto-repeat on everything but the arrows', () => {
    expect(resolveRunnerShortcut(key('Enter', { metaKey: true, isComposing: true }), true)).toBeNull();
    expect(resolveRunnerShortcut(key('KeyP', { keyCode: 229 }), false)).toBeNull();
    expect(resolveRunnerShortcut(key('Enter', { metaKey: true, repeat: true }), true)).toBeNull();
    expect(resolveRunnerShortcut(key('KeyP', { repeat: true }), false)).toBeNull();
    expect(resolveRunnerShortcut(key('ArrowDown', { repeat: true }), false)).toEqual({ kind: 'move', direction: 'next' });
    expect(resolveRunnerShortcut(key('ArrowUp'), false)).toEqual({ kind: 'move', direction: 'previous' });
  });

  it('binds nothing to the digits outside the Report-bug dialog', () => {
    expect(resolveRunnerShortcut(key('Digit1'), false)).toBeNull();
    expect(isCommitChord(key('Digit1'), false)).toBe(false);
    expect(isCommitChord(key('Enter', { ctrlKey: true }), false)).toBe(true);
  });
});

describe('resolveSeverityShortcut', () => {
  it('maps 1 to 4 to the four severities and ignores every other digit or a held modifier', () => {
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4'].map(code => resolveSeverityShortcut(key(code)))).toEqual([0, 1, 2, 3]);
    expect(resolveSeverityShortcut(key('Numpad2'))).toBe(1);
    expect(resolveSeverityShortcut(key('Digit5'))).toBeNull();
    expect(resolveSeverityShortcut(key('Digit1', { metaKey: true }))).toBeNull();
  });
});

describe('guards', () => {
  it('treats text fields, selects and editable regions as typing surfaces, and buttons as not', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, closest: () => null, ...extra }) as unknown as EventTarget;
    expect(isEditableTarget(el('TEXTAREA'))).toBe(true);
    expect(isEditableTarget(el('SELECT'))).toBe(true);
    expect(isEditableTarget(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isEditableTarget(el('INPUT', { type: 'url' }))).toBe(true);
    expect(isEditableTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isEditableTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isEditableTarget(el('BUTTON'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('detects any open modal surface by its dialog role', () => {
    expect(isModalOverlayOpen({ querySelector: () => null })).toBe(false);
    expect(isModalOverlayOpen({ querySelector: () => ({}) as Element })).toBe(true);
  });

  it('recognises macOS from the navigator', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false);
    expect(isMacPlatform({ platform: '', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});
