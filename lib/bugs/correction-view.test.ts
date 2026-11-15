import {
  buildCorrectionBody,
  canCorrectDefect,
  draftFromBug,
  parseCorrectionFailure,
  titleError,
} from '@lib/bugs/correction-view';
import { describe, expect, test } from 'bun:test';

const BUG = {
  title: 'Checkout button does nothing',
  severity: 'P3',
  description: null,
  steps_to_reproduce: '1. open cart\n2. click checkout',
  content_version: 4,
};

describe('canCorrectDefect (AC-04)', () => {
  test.each(['owner', 'admin', 'member'])('offers the correction to an active %s', (role) => {
    expect(canCorrectDefect(role)).toBe(true);
  });

  test('never offers it to a Viewer or to someone with no membership', () => {
    expect(canCorrectDefect('viewer')).toBe(false);
    expect(canCorrectDefect(null)).toBe(false);
    expect(canCorrectDefect(undefined)).toBe(false);
  });
});

describe('draftFromBug', () => {
  test('starts from the defect as shown, an absent description as empty text', () => {
    expect(draftFromBug(BUG)).toEqual({
      title: 'Checkout button does nothing',
      severity: 'P3',
      description: '',
      stepsToReproduce: '1. open cart\n2. click checkout',
    });
  });
});

describe('titleError (the filing rule)', () => {
  test.each([['empty', ''], ['whitespace only', '     '], ['four characters', ' abcd '], ['201 characters', 'x'.repeat(201)]])('refuses a title that is %s', (_label, title) => {
    expect(titleError(title)).toBe('Title must be between 5 and 200 characters');
  });

  test('accepts the 5 and 200 boundaries and counts an emoji as one character', () => {
    expect(titleError('abcde')).toBeNull();
    expect(titleError('y'.repeat(200))).toBeNull();
    expect(titleError(`${'z'.repeat(199)}🐞`)).toBeNull();
  });
});

describe('buildCorrectionBody', () => {
  test('sends every field with the loaded version, title and description trimmed, steps as typed', () => {
    const body = buildCorrectionBody({
      title: '  Checkout button does nothing on the second click ',
      severity: 'P2',
      description: '  Happens to every returning customer ',
      stepsToReproduce: '1. open cart\n2. click checkout\n3. click checkout again ',
    }, 4);
    expect(body).toEqual({
      expected_version: 4,
      title: 'Checkout button does nothing on the second click',
      severity: 'P2',
      description: 'Happens to every returning customer',
      steps_to_reproduce: '1. open cart\n2. click checkout\n3. click checkout again ',
    });
  });
});

describe('parseCorrectionFailure', () => {
  test('a 409 carries the current defect so the dialog can show it', () => {
    const current = { ...BUG, title: 'Teammate version', content_version: 5 };
    const failure = parseCorrectionFailure(409, { error: { message: 'changed', details: { reason: 'bug_changed', current } } });
    expect(failure.kind).toBe('stale');
    expect(failure.kind === 'stale' && failure.current).toEqual(current);
  });

  test('a 409 without a readable current defect still reports the staleness', () => {
    const failure = parseCorrectionFailure(409, {});
    expect(failure).toMatchObject({ kind: 'stale', current: null });
  });

  test('a validation error shows the server message', () => {
    expect(parseCorrectionFailure(422, { error: { message: 'Title must be between 5 and 200 characters' } }))
      .toEqual({ kind: 'error', message: 'Title must be between 5 and 200 characters' });
  });

  test('a network-shaped failure without a body gets a named, retryable message', () => {
    expect(parseCorrectionFailure(500, null)).toEqual({ kind: 'error', message: 'Could not save the correction. Try again.' });
  });
});
