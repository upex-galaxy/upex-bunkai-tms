import { parseAtcExpand } from '@lib/atcs/expand';
import { describe, expect, it } from 'bun:test';

describe('parseAtcExpand', () => {
  it('returns an empty set when no expand is sent', () => {
    expect(parseAtcExpand([])).toEqual({ ok: true, expansions: new Set() });
    expect(parseAtcExpand([''])).toEqual({ ok: true, expansions: new Set() });
  });

  it('accepts the four documented expansions', () => {
    const r = parseAtcExpand(['steps,assertions,acceptance_criteria,used_in']);
    expect(r).toEqual({ ok: true, expansions: new Set(['steps', 'assertions', 'acceptance_criteria', 'used_in']) });
  });

  it('trims, lowercases, dedupes, skips empty segments and merges repeated params', () => {
    const r = parseAtcExpand([' Steps , ,steps', 'USED_IN,']);
    expect(r).toEqual({ ok: true, expansions: new Set(['steps', 'used_in']) });
  });

  it('refuses an unrecognised value naming it', () => {
    expect(parseAtcExpand(['steps,bogus'])).toEqual({ ok: false, invalid: 'bogus' });
  });
});
