import { describe, expect, it } from 'bun:test';
import { testWriteErrorMessage } from './archive-client';
import { testArchivedToast, testArchivePlansHeadline, testArchiveRunsCopy } from './archive-copy';

// BK-596 — the archive confirmation's words and the client's error copy.

describe('testArchiveRunsCopy', () => {
  it('states a never-run Test plainly', () => {
    expect(testArchiveRunsCopy(0)).toBe('No Run has been recorded against this Test.');
  });

  it('says the Runs are kept and stay readable, singular and plural', () => {
    expect(testArchiveRunsCopy(1)).toBe('1 Run has been recorded. It is kept and stays readable.');
    expect(testArchiveRunsCopy(12)).toBe('12 Runs have been recorded. They are kept and stay readable.');
  });
});

describe('testArchivePlansHeadline', () => {
  it('is absent when no plan holds the Test', () => {
    expect(testArchivePlansHeadline(0)).toBeNull();
  });

  it('counts the holding plans', () => {
    expect(testArchivePlansHeadline(1)).toBe('1 Test Plan holds this Test.');
    expect(testArchivePlansHeadline(2)).toBe('2 Test Plans hold this Test.');
  });
});

describe('testArchivedToast', () => {
  it('names the Test and where to restore it', () => {
    expect(testArchivedToast('Checkout - guest')).toBe('Archived “Checkout - guest”. Restore it from this Test\'s page any time.');
  });
});

describe('testWriteErrorMessage', () => {
  it('maps every named reason to its own sentence', () => {
    expect(testWriteErrorMessage(422, { error: { details: { reason: 'title_required' } } })).toBe('A Test needs a name.');
    expect(testWriteErrorMessage(422, { error: { details: { reason: 'title_too_long' } } })).toBe('Keep the name to 200 characters or fewer.');
    expect(testWriteErrorMessage(409, { error: { details: { reason: 'version_conflict' } } })).toContain('Reload');
    expect(testWriteErrorMessage(409, { error: { details: { reason: 'test_archived' } } })).toContain('Restore it');
  });

  it('falls back on the status, then on the server message', () => {
    expect(testWriteErrorMessage(403, {})).toContain('permission');
    expect(testWriteErrorMessage(404, {})).toContain('no longer available');
    expect(testWriteErrorMessage(500, { error: { message: 'boom' } })).toBe('boom');
    expect(testWriteErrorMessage(500, {})).toBe('The server did not say why.');
  });
});
