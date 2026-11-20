import { ApiError } from '@lib/api/error-envelope';
import { parseCiContext, parseRunStartCiContext, presentCiContext } from '@lib/runs/ci-context';
import { describe, expect, test } from 'bun:test';

const FULL = {
  commit: 'a1b2c3d',
  branch: 'feature/checkout-discounts',
  pipeline_name: 'nightly-regression',
  pipeline_url: 'https://ci.acme.dev/p/42',
};

function refusal(run: () => unknown): ApiError {
  try {
    run();
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
  throw new Error('expected a refusal');
}

function refusedField(payload: Record<string, unknown>): string {
  const err = refusal(() => parseCiContext(payload));
  expect(err.status).toBe(422);
  expect(err.code).toBe('validation_failed');
  const details = err.details as { field: string, reason: string };
  expect(details.reason).toBe(`${details.field}_invalid`);
  expect(err.message.startsWith(details.field)).toBe(true);
  return details.field;
}

function hex(length: number): string {
  return 'a'.repeat(length);
}

function url(length: number, scheme: 'https' | 'http'): string {
  const prefix = `${scheme}://ci.acme.dev/`;
  return prefix + 'p'.repeat(length - prefix.length);
}

describe('parseCiContext', () => {
  test('returns the four details as sent (AC1)', () => {
    expect(parseCiContext(FULL)).toEqual(FULL);
  });

  test('every detail is optional, absent and null read as not reported (AC3)', () => {
    expect(parseCiContext({ branch: 'feature/checkout-discounts' })).toEqual({
      commit: null,
      branch: 'feature/checkout-discounts',
      pipeline_name: null,
      pipeline_url: null,
    });
    expect(parseCiContext({ commit: 'a1b2c3d', branch: null })).toEqual({
      commit: 'a1b2c3d',
      branch: null,
      pipeline_name: null,
      pipeline_url: null,
    });
    expect(parseCiContext({})).toEqual({ commit: null, branch: null, pipeline_name: null, pipeline_url: null });
  });

  test('refuses invalid values and names the field (AC4)', () => {
    expect(refusedField({ commit: 'zz!' })).toBe('commit');
    expect(refusedField({ branch: 'b'.repeat(256) })).toBe('branch');
    expect(refusedField({ pipeline_url: 'javascript:alert(1)' })).toBe('pipeline_url');
    expect(refusedField({ pipeline_url: 'ftp://ci.acme.dev' })).toBe('pipeline_url');
    expect(refusedField({ pipeline_url: 'data:text/html,hi' })).toBe('pipeline_url');
  });

  test.each([
    ['commit', hex(6), false],
    ['commit', hex(7), true],
    ['commit', hex(64), true],
    ['commit', hex(65), false],
    ['branch', '', false],
    ['branch', 'b', true],
    ['branch', 'b'.repeat(255), true],
    ['branch', 'b'.repeat(256), false],
    ['pipeline_name', '', false],
    ['pipeline_name', 'n', true],
    ['pipeline_name', 'n'.repeat(100), true],
    ['pipeline_name', 'n'.repeat(101), false],
    ['pipeline_url', url(2048, 'https'), true],
    ['pipeline_url', url(2049, 'https'), false],
    ['pipeline_url', url(2048, 'http'), true],
  ] as const)('%s of %#: boundary (AC5)', (field, value, accepted) => {
    if (accepted) {
      expect(parseCiContext({ [field]: value })[field]).toBe(value);
    }
    else {
      expect(refusedField({ [field]: value })).toBe(field);
    }
  });

  test('counts a multi-byte branch in characters, not bytes or code units (AC5, D7)', () => {
    const accented = 'ñ'.repeat(255);
    expect(parseCiContext({ branch: accented }).branch).toBe(accented);
    const astral = String.fromCodePoint(0x1F680).repeat(255);
    expect(parseCiContext({ branch: astral }).branch).toBe(astral);
    expect(refusedField({ branch: String.fromCodePoint(0x1F680).repeat(256) })).toBe('branch');
  });

  test('stores the commit lower-cased and trims surrounding whitespace (D7)', () => {
    const ci = parseCiContext({ commit: '  A1B2C3D  ', branch: '  feature/x ', pipeline_name: ' nightly ', pipeline_url: ' https://ci.acme.dev/p/42 ' });
    expect(ci).toEqual({ commit: 'a1b2c3d', branch: 'feature/x', pipeline_name: 'nightly', pipeline_url: 'https://ci.acme.dev/p/42' });
  });

  test('refuses an empty value after trimming (D6)', () => {
    expect(refusedField({ branch: '   ' })).toBe('branch');
    expect(refusedField({ pipeline_name: ' ' })).toBe('pipeline_name');
    expect(refusedField({ commit: '' })).toBe('commit');
    expect(refusedField({ pipeline_url: '' })).toBe('pipeline_url');
  });

  test('refuses line breaks and control characters anywhere (D7)', () => {
    expect(refusedField({ branch: 'main\n' })).toBe('branch');
    expect(refusedField({ branch: 'ma\tin' })).toBe('branch');
    expect(refusedField({ pipeline_name: 'night\rly' })).toBe('pipeline_name');
    expect(refusedField({ pipeline_name: `night${String.fromCharCode(0)}ly` })).toBe('pipeline_name');
    expect(refusedField({ branch: `main${String.fromCharCode(0x2028)}` })).toBe('branch');
    expect(refusedField({ branch: `main${String.fromCharCode(0x85)}` })).toBe('branch');
    expect(refusedField({ commit: 'a1b2c3d\n' })).toBe('commit');
  });

  test('accepts markup and emoji in names as plain text', () => {
    const ci = parseCiContext({ branch: '<script>alert(1)</script>', pipeline_name: `deploy ${String.fromCodePoint(0x1F680)}` });
    expect(ci.branch).toBe('<script>alert(1)</script>');
    expect(ci.pipeline_name).toBe(`deploy ${String.fromCodePoint(0x1F680)}`);
  });

  test('refuses a pipeline URL with embedded credentials (AC14, D5)', () => {
    expect(refusedField({ pipeline_url: 'https://ci:s3cret@ci.acme.dev/p/42' })).toBe('pipeline_url');
    expect(refusedField({ pipeline_url: 'https://ci@ci.acme.dev/p/42' })).toBe('pipeline_url');
    expect(refusedField({ pipeline_url: 'https://@ci.acme.dev/p/42' })).toBe('pipeline_url');
  });

  test('keeps an @ after the host and refuses inner whitespace', () => {
    expect(parseCiContext({ pipeline_url: 'https://ci.acme.dev/p/42?by=a@b' }).pipeline_url).toBe('https://ci.acme.dev/p/42?by=a@b');
    expect(refusedField({ pipeline_url: 'https://ci.acme.dev/p 42' })).toBe('pipeline_url');
    expect(refusedField({ pipeline_url: 'https:/ci.acme.dev' })).toBe('pipeline_url');
  });

  test.each([
    ['branch', 42],
    ['commit', 1234567],
    ['pipeline_name', ['nightly']],
    ['pipeline_url', { href: 'https://ci.acme.dev' }],
    ['branch', true],
  ] as const)('refuses %s of the wrong type (AC15)', (field, value) => {
    expect(refusedField({ [field]: value })).toBe(field);
  });

  test('records a tag name sent in branch (AC16)', () => {
    expect(parseCiContext({ branch: 'v1.4.0' }).branch).toBe('v1.4.0');
  });
});

describe('parseRunStartCiContext', () => {
  test('a token open accepts the details whatever the executor (AC8b)', () => {
    expect(parseRunStartCiContext('bearer', { ...FULL, executor_mode: 'human' })).toEqual(FULL);
    expect(parseRunStartCiContext('bearer', { commit: 'a1b2c3d' }).commit).toBe('a1b2c3d');
  });

  test('a token open validates the details (AC4)', () => {
    const err = refusal(() => parseRunStartCiContext('bearer', { commit: 'zz!' }));
    expect(err.status).toBe(422);
    expect((err.details as { field: string }).field).toBe('commit');
  });

  test('the in-app start refuses any detail and names it (AC8, AC8c)', () => {
    const err = refusal(() => parseRunStartCiContext('cookie', { test_id: 'x', branch: 'main', commit: 'a1b2c3d' }));
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'ci_context_not_allowed', fields: ['commit', 'branch'] });
    expect(err.message).toContain('commit, branch');
  });

  test('the in-app start without details reads as no CI context', () => {
    expect(parseRunStartCiContext('cookie', { test_id: 'x', branch: null })).toEqual({ commit: null, branch: null, pipeline_name: null, pipeline_url: null });
  });

  test('a non-object body yields no CI context (the body schema refuses it)', () => {
    expect(parseRunStartCiContext('bearer', null)).toEqual({ commit: null, branch: null, pipeline_name: null, pipeline_url: null });
  });
});

describe('presentCiContext', () => {
  test('keeps only the reported details, so an older payload hashes unchanged', () => {
    expect(presentCiContext({ commit: null, branch: 'main', pipeline_name: null, pipeline_url: null })).toEqual({ branch: 'main' });
    expect(presentCiContext({ commit: null, branch: null, pipeline_name: null, pipeline_url: null })).toEqual({});
  });
});
