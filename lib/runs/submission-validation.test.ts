import { ApiError } from '@lib/api/error-envelope';
import { parseRunSubmissionBody } from '@lib/runs/submission-validation';
import { describe, expect, test } from 'bun:test';

const TEST_ID = '8a1d2c3e-1111-4222-8333-444455556666';

function valid(overrides: Record<string, unknown> = {}) {
  return {
    test_id: TEST_ID,
    environment: 'Staging',
    verdict: 'passed',
    duration_seconds: 92,
    steps: [
      { position: 1, result: 'pass' },
      { position: 2, result: 'pass' },
    ],
    evidence_urls: ['https://ci.example.com/run/1'],
    idempotency_key: 'ci-2026-07-11-checkout-01',
    ...overrides,
  };
}

function fail(payload: unknown): ApiError {
  try {
    parseRunSubmissionBody(payload);
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
  throw new Error('expected parseRunSubmissionBody to throw');
}

describe('parseRunSubmissionBody', () => {
  test('accepts the AC-1 shape and trims the environment', () => {
    const body = parseRunSubmissionBody(valid({ environment: '  Staging ' }));
    expect(body.environment).toBe('Staging');
    expect(body.steps).toHaveLength(2);
    expect(body.idempotency_key).toBe('ci-2026-07-11-checkout-01');
  });

  test('evidence and the key are optional', () => {
    const body = parseRunSubmissionBody(valid({ evidence_urls: undefined, idempotency_key: undefined }));
    expect(body.evidence_urls).toEqual([]);
    expect(body.idempotency_key).toBeUndefined();
  });

  test('AC-5: an unknown verdict lists the accepted values', () => {
    for (const verdict of ['success', 'aborted', 'running', undefined]) {
      const err = fail(valid({ verdict }));
      expect(err.status).toBe(422);
      expect(err.message).toBe('verdict must be one of: passed, failed.');
      expect(err.details).toMatchObject({ reason: 'verdict_invalid', accepted: ['passed', 'failed'] });
    }
  });

  test('AC-5: an unknown step result lists the accepted values', () => {
    const err = fail(valid({ steps: [{ position: 1, result: 'ok' }] }));
    expect(err.message).toBe('steps[0].result must be one of: pass, fail, block.');
    expect(err.details).toMatchObject({ reason: 'step_result_invalid', accepted: ['pass', 'fail', 'block'] });
  });

  test('AC-6: passed with a fail or block step is inconsistent and names the positions', () => {
    const err = fail(valid({ steps: [{ position: 1, result: 'pass' }, { position: 2, result: 'block' }] }));
    expect(err.message).toContain('inconsistent');
    expect(err.message).toContain('2');
    expect(err.details).toMatchObject({ reason: 'verdict_inconsistent', non_passing_positions: [2] });
  });

  test('AC-6: failed with every step pass is inconsistent', () => {
    const err = fail(valid({ verdict: 'failed' }));
    expect(err.details).toMatchObject({ reason: 'verdict_inconsistent' });
  });

  test('failed with one fail step is accepted', () => {
    const body = parseRunSubmissionBody(valid({
      verdict: 'failed',
      steps: [{ position: 1, result: 'pass' }, { position: 2, result: 'fail' }],
    }));
    expect(body.verdict).toBe('failed');
  });

  test('a repeated position is rejected and named', () => {
    const err = fail(valid({ steps: [{ position: 1, result: 'pass' }, { position: 1, result: 'pass' }] }));
    expect(err.details).toMatchObject({ reason: 'steps_duplicate_position', duplicate_positions: [1] });
  });

  test('position 0, a fraction and a non-number are rejected', () => {
    for (const position of [0, 1.5, '1', null]) {
      expect(fail(valid({ steps: [{ position, result: 'pass' }] })).details).toMatchObject({ reason: 'steps_invalid' });
    }
  });

  test('an empty or oversized steps list is rejected', () => {
    expect(fail(valid({ steps: [] })).details).toMatchObject({ reason: 'steps_invalid' });
    const many = Array.from({ length: 501 }, (_, i) => ({ position: i + 1, result: 'pass' }));
    expect(fail(valid({ steps: many })).details).toMatchObject({ reason: 'steps_invalid' });
  });

  describe('duration BVA', () => {
    test.each([0, 86400])('accepts %d', (duration_seconds) => {
      expect(parseRunSubmissionBody(valid({ duration_seconds })).duration_seconds).toBe(duration_seconds);
    });

    test.each([-1, 86401, 1.5, '92', null])('rejects %p', (duration_seconds) => {
      expect(fail(valid({ duration_seconds })).details).toMatchObject({ reason: 'duration_invalid' });
    });
  });

  describe('idempotency key BVA', () => {
    test('accepts 1 and 64 characters', () => {
      expect(parseRunSubmissionBody(valid({ idempotency_key: 'a' })).idempotency_key).toBe('a');
      expect(parseRunSubmissionBody(valid({ idempotency_key: 'k'.repeat(64) })).idempotency_key).toHaveLength(64);
    });

    test('rejects 65 characters and an empty key', () => {
      expect(fail(valid({ idempotency_key: 'k'.repeat(65) })).details).toMatchObject({ reason: 'idempotency_key_invalid' });
      expect(fail(valid({ idempotency_key: '' })).details).toMatchObject({ reason: 'idempotency_key_invalid' });
    });
  });

  describe('evidence', () => {
    test('accepts 20 URLs and rejects 21', () => {
      const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://e.example.com/${i}`);
      expect(parseRunSubmissionBody(valid({ evidence_urls: urls(20) })).evidence_urls).toHaveLength(20);
      expect(fail(valid({ evidence_urls: urls(21) })).details).toMatchObject({ reason: 'evidence_too_many' });
    });

    test.each(['javascript:alert(1)', 'ftp://host/file', 'not a url', 'https://a b.com', ''])(
      'rejects %p and names the entry',
      (bad) => {
        const err = fail(valid({ evidence_urls: ['https://ok.example.com', bad] }));
        expect(err.message).toContain('evidence_urls[1]');
        expect(err.details).toMatchObject({ reason: 'evidence_url_invalid', index: 1 });
      },
    );

    test('rejects a URL longer than 2048 characters', () => {
      const long = `https://e.example.com/${'a'.repeat(2048)}`;
      expect(fail(valid({ evidence_urls: [long] })).details).toMatchObject({ reason: 'evidence_url_invalid' });
    });
  });

  test('rejects a bad test_id, a missing environment and a non-object body', () => {
    expect(fail(valid({ test_id: 'nope' })).details).toMatchObject({ reason: 'test_id_invalid' });
    expect(fail(valid({ environment: '  ' })).details).toMatchObject({ reason: 'environment_invalid' });
    expect(fail('x').details).toMatchObject({ reason: 'body_invalid' });
    expect(fail([]).details).toMatchObject({ reason: 'body_invalid' });
  });
});
