import type { StepAttachment } from './evidence-view';
import { describe, expect, it } from 'bun:test';
import {
  attachmentContentPath,
  canRemoveAttachment,
  evidenceCounter,
  formatByteSize,
  groupAttachmentsByStep,
  resolveEvidenceControlState,
} from './evidence-view';

// BK-593 - the runner's evidence view-state: who sees the Attach control, who can remove, the
// quota hint, grouping and labels. Pure, no browser needed.

const MIB = 1024 * 1024;

function att(overrides: Partial<StepAttachment> = {}): StepAttachment {
  return {
    id: 'a1',
    run_id: 'r1',
    run_step_id: 's1',
    filename: 'shot.png',
    content_type: 'image/png',
    byte_size: 1000,
    status: 'committed',
    created_by: 'me',
    created_at: '2026-10-19T10:00:00Z',
    committed_at: '2026-10-19T10:00:05Z',
    ...overrides,
  };
}

describe('resolveEvidenceControlState', () => {
  it('shows Attach to member+ on a running Run, whatever the step status', () => {
    const state = resolveEvidenceControlState({ canAttach: true, runStatus: 'running', attachments: [] });
    expect(state).toEqual({ showAttach: true, disabled: false, hint: null });
  });

  it('hides Attach for a viewer and for every terminal Run (evidence is fixed once the Run closes)', () => {
    expect(resolveEvidenceControlState({ canAttach: false, runStatus: 'running', attachments: [] }).showAttach).toBe(false);
    for (const runStatus of ['passed', 'failed', 'aborted'] as const) {
      expect(resolveEvidenceControlState({ canAttach: true, runStatus, attachments: [] }).showAttach).toBe(false);
    }
  });

  it('disables Attach with the frozen copy at 10 images', () => {
    const ten = Array.from({ length: 10 }, (_, i) => att({ id: `a${i}` }));
    expect(resolveEvidenceControlState({ canAttach: true, runStatus: 'running', attachments: ten })).toEqual({
      showAttach: true,
      disabled: true,
      hint: 'This step already holds the maximum evidence (10 images or 50 MiB).',
    });
    expect(resolveEvidenceControlState({ canAttach: true, runStatus: 'running', attachments: ten.slice(0, 9) }).disabled).toBe(false);
  });

  it('disables Attach once the step holds 50 MiB', () => {
    const full = Array.from({ length: 5 }, (_, i) => att({ id: `a${i}`, byte_size: 10 * MIB }));
    expect(resolveEvidenceControlState({ canAttach: true, runStatus: 'running', attachments: full }).disabled).toBe(true);
    const almost = [...full.slice(0, 4), att({ id: 'x', byte_size: 10 * MIB - 1 })];
    expect(resolveEvidenceControlState({ canAttach: true, runStatus: 'running', attachments: almost }).disabled).toBe(false);
  });
});

describe('canRemoveAttachment', () => {
  it('lets only the uploader remove, and only while the Run is running', () => {
    const base = { canAttach: true, runStatus: 'running' as const, currentUserId: 'me' };
    expect(canRemoveAttachment({ ...base, attachment: att({ created_by: 'me' }) })).toBe(true);
    expect(canRemoveAttachment({ ...base, attachment: att({ created_by: 'someone-else' }) })).toBe(false);
    expect(canRemoveAttachment({ ...base, attachment: att({ created_by: null }) })).toBe(false);
    expect(canRemoveAttachment({ ...base, runStatus: 'passed', attachment: att() })).toBe(false);
    expect(canRemoveAttachment({ ...base, runStatus: 'aborted', attachment: att() })).toBe(false);
    expect(canRemoveAttachment({ ...base, canAttach: false, attachment: att() })).toBe(false);
  });
});

describe('groupAttachmentsByStep', () => {
  it('groups by step and orders oldest first, ties broken by id', () => {
    const grouped = groupAttachmentsByStep([
      att({ id: 'c', run_step_id: 's2', created_at: '2026-10-19T10:00:09Z' }),
      att({ id: 'b', run_step_id: 's1', created_at: '2026-10-19T10:00:02Z' }),
      att({ id: 'a', run_step_id: 's1', created_at: '2026-10-19T10:00:02Z' }),
      att({ id: 'z', run_step_id: 's1', created_at: '2026-10-19T10:00:01Z' }),
    ]);
    expect(grouped.s1.map(a => a.id)).toEqual(['z', 'a', 'b']);
    expect(grouped.s2.map(a => a.id)).toEqual(['c']);
    expect(grouped.s3).toBeUndefined();
  });
});

describe('labels', () => {
  it('builds the authorized content path (a redirect, never a stored URL)', () => {
    expect(attachmentContentPath(att())).toBe('/api/v1/runs/r1/steps/s1/attachments/a1/content');
  });

  it('formats sizes in binary units', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(1536)).toBe('1.5 KiB');
    expect(formatByteSize(10 * MIB)).toBe('10 MiB');
    expect(formatByteSize(5.25 * MIB)).toBe('5.3 MiB');
  });

  it('counts images against the per-step cap', () => {
    expect(evidenceCounter(0)).toBe('0 / 10');
    expect(evidenceCounter(3)).toBe('3 / 10');
  });
});
