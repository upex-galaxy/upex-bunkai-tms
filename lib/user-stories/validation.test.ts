import { byteLength } from '@lib/markdown/format';
import { jiraKeyError, MAX_STORY_DESCRIPTION_BYTES, normalizeJiraKey, storyTitleError } from '@lib/user-stories/validation';
import { describe, expect, test } from 'bun:test';

describe('storyTitleError', () => {
  test('accepts a normal title', () => {
    expect(storyTitleError('Refund a paid order')).toBeNull();
  });

  test('empty / whitespace is title_required', () => {
    expect(storyTitleError('')).toBe('title_required');
    expect(storyTitleError('   ')).toBe('title_required');
  });

  test('2 chars rejected, 3 chars accepted (min boundary)', () => {
    expect(storyTitleError('Re')).toBe('title_too_short');
    expect(storyTitleError('Ref')).toBeNull();
  });

  test('200 chars accepted, 201 rejected (max boundary)', () => {
    expect(storyTitleError('a'.repeat(200))).toBeNull();
    expect(storyTitleError('a'.repeat(201))).toBe('title_too_long');
  });
});

describe('normalizeJiraKey', () => {
  test('trims and upper-cases', () => {
    expect(normalizeJiraKey('  bk-42 ')).toBe('BK-42');
  });
});

describe('jiraKeyError', () => {
  test('null for an empty (optional) key', () => {
    expect(jiraKeyError('')).toBeNull();
    expect(jiraKeyError('   ')).toBeNull();
  });

  test('accepts a well-formed key (case-insensitive input)', () => {
    expect(jiraKeyError('BK-42')).toBeNull();
    expect(jiraKeyError('bk-42')).toBeNull();
    expect(jiraKeyError('UPEX-1234')).toBeNull();
  });

  test('rejects malformed keys', () => {
    expect(jiraKeyError('not a key')).toBe('external_id_invalid');
    expect(jiraKeyError('BK42')).toBe('external_id_invalid');
    expect(jiraKeyError('BK-')).toBe('external_id_invalid');
    expect(jiraKeyError('123-BK')).toBe('external_id_invalid');
  });
});

describe('MAX_STORY_DESCRIPTION_BYTES (BK-99)', () => {
  test('is 50 KB decimal — 50,000 bytes, not 50 KiB', () => {
    expect(MAX_STORY_DESCRIPTION_BYTES).toBe(50_000);
  });

  test('the QA repro payload (51,000 bytes) lands over the cap', () => {
    expect(byteLength('A'.repeat(51_000)) > MAX_STORY_DESCRIPTION_BYTES).toBe(true);
  });

  test('boundary: exactly 50,000 bytes is allowed, 50,001 is not', () => {
    expect(byteLength('A'.repeat(50_000)) > MAX_STORY_DESCRIPTION_BYTES).toBe(false);
    expect(byteLength('A'.repeat(50_001)) > MAX_STORY_DESCRIPTION_BYTES).toBe(true);
  });
});
