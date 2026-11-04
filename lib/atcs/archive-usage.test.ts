import { describe, expect, it } from 'bun:test';
import {
  ARCHIVE_NO_USAGE_COPY,
  ARCHIVE_USAGE_LIST_CAP,
  archiveMoreCopy,
  archiveUsageHeadline,
  boundUsageTitles,
} from './archive-usage';

describe('archiveUsageHeadline', () => {
  it('says no Test chains the ATC for zero', () => {
    expect(archiveUsageHeadline(0)).toBe(ARCHIVE_NO_USAGE_COPY);
  });

  it('uses the singular for exactly one Test', () => {
    expect(archiveUsageHeadline(1)).toBe('1 Test chains this ATC.');
  });

  it('uses the plural for more than one Test, with the exact count', () => {
    expect(archiveUsageHeadline(2)).toBe('2 Tests chain this ATC.');
    expect(archiveUsageHeadline(37)).toBe('37 Tests chain this ATC.');
  });
});

describe('boundUsageTitles', () => {
  const titles = (n: number) => Array.from({ length: n }, (_, i) => `Test ${i + 1}`);

  it('shows every title and no remainder at or under the cap', () => {
    expect(boundUsageTitles(titles(0))).toEqual({ shown: [], more: 0 });
    expect(boundUsageTitles(titles(3))).toEqual({ shown: titles(3), more: 0 });
    expect(boundUsageTitles(titles(ARCHIVE_USAGE_LIST_CAP))).toEqual({ shown: titles(5), more: 0 });
  });

  it('caps at 5 and counts the rest', () => {
    expect(boundUsageTitles(titles(6))).toEqual({ shown: titles(5), more: 1 });
    expect(boundUsageTitles(titles(12))).toEqual({ shown: titles(5), more: 7 });
  });

  it('honours an explicit cap', () => {
    expect(boundUsageTitles(titles(4), 2)).toEqual({ shown: titles(2), more: 2 });
  });
});

describe('archiveMoreCopy', () => {
  it('reads "and N more"', () => {
    expect(archiveMoreCopy(7)).toBe('and 7 more');
  });
});
