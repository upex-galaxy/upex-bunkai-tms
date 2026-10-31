import { describe, expect, it } from 'bun:test';
import {
  isWorkspaceDeletedRefusal,
  WORKSPACE_DELETED_LANDING,
  WORKSPACE_DELETED_NOTICE,
  WORKSPACE_DELETED_ONBOARDING,
  workspaceDeletedToast,
} from './deleted-notice';

// BK-1129 — BK-512 Scenario N3, client half: which responses send the Runner
// to the shell, and what the shell then tells the caller.

const deletedBody = { error: { code: 'not_found', message: 'This workspace was deleted.', details: { reason: 'workspace_deleted' } } };

describe('isWorkspaceDeletedRefusal (BK-1129)', () => {
  it('matches the Run endpoints\' 404 with reason workspace_deleted', () => {
    expect(isWorkspaceDeletedRefusal(404, deletedBody)).toBe(true);
  });

  it('ignores a plain non-disclosing 404 (missing or foreign Run)', () => {
    expect(isWorkspaceDeletedRefusal(404, { error: { code: 'not_found', message: 'Run not found.', details: { reason: 'not_found' } } })).toBe(false);
  });

  it('ignores the 403 a non-member still gets on a write', () => {
    expect(isWorkspaceDeletedRefusal(403, { error: { code: 'forbidden', details: { reason: 'not_a_member' } } })).toBe(false);
  });

  it('requires the 404 status, not just the reason', () => {
    expect(isWorkspaceDeletedRefusal(409, deletedBody)).toBe(false);
  });

  it('tolerates an unparseable or empty body', () => {
    expect(isWorkspaceDeletedRefusal(404, null)).toBe(false);
    expect(isWorkspaceDeletedRefusal(404, {})).toBe(false);
    expect(isWorkspaceDeletedRefusal(404, 'Not Found')).toBe(false);
  });
});

describe('workspaceDeletedToast (BK-1129)', () => {
  it('names the workspace the AC-09 resolver moved the caller to', () => {
    expect(workspaceDeletedToast('Acme QA')).toBe('The workspace you were in was deleted. Acme QA is now your active workspace.');
  });

  it('says only that it was deleted when no workspace remains (onboarding)', () => {
    expect(workspaceDeletedToast(null)).toBe('The workspace you were in was deleted.');
  });
});

describe('landing routes (BK-1129)', () => {
  it('carry the notice the shell listens for', () => {
    expect(WORKSPACE_DELETED_LANDING).toBe(`/home?notice=${WORKSPACE_DELETED_NOTICE}`);
    expect(WORKSPACE_DELETED_ONBOARDING).toBe(`/onboarding?notice=${WORKSPACE_DELETED_NOTICE}`);
  });
});
