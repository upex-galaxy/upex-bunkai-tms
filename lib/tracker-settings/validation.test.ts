import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import {
  normalizeDestinationKey,
  parseTrackerSettingsBody,
  TRACKER_SETTINGS_MESSAGES,
  TrackerSettingsBodySchema,
  TrackerSettingsCheckBodySchema,
} from './validation';

// BK-371 — AC-3.1 / 3.2 / 3.3 / 3.4, AC-2.6, AC-9. Pure rules, no I/O.

function reasonOf(fn: () => unknown): string | undefined {
  try {
    fn();
  }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.code).toBe('validation_failed');
    expect(apiError.status).toBe(422);
    return (apiError.details as { reason?: string }).reason;
  }
  return undefined;
}

const body = (key: unknown, extra: Record<string, unknown> = {}) => ({
  destination_project_key: key,
  issue_type_name: 'Bug',
  enabled: true,
  ...extra,
});

describe('normalizeDestinationKey', () => {
  it('trims and upper-cases ASCII letters', () => {
    expect(normalizeDestinationKey(' qas ')).toBe('QAS');
    expect(normalizeDestinationKey('qa_1x')).toBe('QA_1X');
  });

  it('never turns a sharp s into SS or touches non-ASCII letters', () => {
    expect(normalizeDestinationKey('ßß')).toBe('ßß');
    expect(normalizeDestinationKey('qás')).toBe('QáS');
  });
});

describe('destination key partitions (AC-3.1 / 3.2)', () => {
  it.each(['AB', 'ABC', 'ABCDEFGHI', 'ABCDEFGHIJ', 'A1_B'])('accepts %p', (key) => {
    const parsed = parseTrackerSettingsBody(TrackerSettingsBodySchema, body(key));
    expect(parsed.destination_project_key).toBe(key);
  });

  it.each(['1AB', 'QA-1', 'QA S', 'QA.S', 'QÁS', '_AB', 'A', 'ABCDEFGHIJK', 'ßß'])('refuses %p as invalid_destination_key', (key) => {
    expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body(key)))).toBe('invalid_destination_key');
  });

  it('normalises lower case and surrounding spaces instead of refusing (AC-3.3)', () => {
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body('qas')).destination_project_key).toBe('QAS');
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body(' QAS ')).destination_project_key).toBe('QAS');
  });

  it('refuses malformed shapes the server must catch without the screen (AC-2.6 / 3.4)', () => {
    for (const key of ['../admin', 'QA"S', 'qa-1', 'x'.repeat(10_000), 'x'.repeat(300)]) {
      expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsCheckBodySchema, { destination_project_key: key }))).toBe('invalid_destination_key');
    }
  });

  it('treats a missing or blank key as destination_required (AC-1.3)', () => {
    expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body('')))).toBe('destination_required');
    expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body('   ')))).toBe('destination_required');
    expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, { enabled: true }))).toBe('destination_required');
  });

  it('treats a non-string key as invalid, never as a crash', () => {
    expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body(123)))).toBe('invalid_destination_key');
  });

  it('carries the frozen copy and never echoes the typed value', () => {
    try {
      parseTrackerSettingsBody(TrackerSettingsBodySchema, body('../admin'));
    }
    catch (error) {
      const apiError = error as ApiError;
      expect(apiError.message).toBe(TRACKER_SETTINGS_MESSAGES.invalid_destination_key);
      expect(JSON.stringify(apiError.details)).not.toContain('admin');
    }
  });
});

describe('issue type (AC-9)', () => {
  it('defaults to "Bug" and trims', () => {
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, { destination_project_key: 'QAS', enabled: false }).issue_type_name).toBe('Bug');
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { issue_type_name: '  Task  ' })).issue_type_name).toBe('Task');
  });

  it('accepts the 1 and 60 character boundaries', () => {
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { issue_type_name: 'x' })).issue_type_name).toBe('x');
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { issue_type_name: 'x'.repeat(60) })).issue_type_name).toHaveLength(60);
  });

  it('counts code points like the SQL char_length: 60 emoji are accepted, 61 refused', () => {
    const sixty = '😀'.repeat(60);
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { issue_type_name: sixty })).issue_type_name).toBe(sixty);
    expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { issue_type_name: '😀'.repeat(61) })))).toBe('invalid_issue_type');
  });

  it('refuses empty, blank and over-60 values with the frozen copy', () => {
    for (const issueType of ['', '   ', 'x'.repeat(61)]) {
      expect(reasonOf(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { issue_type_name: issueType })))).toBe('invalid_issue_type');
    }
    expect(TRACKER_SETTINGS_MESSAGES.invalid_issue_type).toBe('Issue type must be 1 to 60 characters.');
  });
});

describe('enabled and confirm_queue_count', () => {
  it('requires a boolean switch', () => {
    expect(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, { destination_project_key: 'QAS' })).toThrow(ApiError);
    expect(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { enabled: 'yes' }))).toThrow(ApiError);
  });

  it('accepts a non-negative integer confirmation and refuses the rest', () => {
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { confirm_queue_count: 0 })).confirm_queue_count).toBe(0);
    expect(parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { confirm_queue_count: 12 })).confirm_queue_count).toBe(12);
    for (const bad of [-1, 1.5, '3']) {
      expect(() => parseTrackerSettingsBody(TrackerSettingsBodySchema, body('QAS', { confirm_queue_count: bad }))).toThrow(ApiError);
    }
  });

  it('check body ignores the switch', () => {
    const parsed = parseTrackerSettingsBody(TrackerSettingsCheckBodySchema, { destination_project_key: 'qas', enabled: true });
    expect(parsed).toEqual({ destination_project_key: 'QAS', issue_type_name: 'Bug' });
  });
});
