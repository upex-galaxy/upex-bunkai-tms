import type { ChainedAtc } from '@components/tests/TestDetailView';
import { archivedStepsNotice, duplicatePrefill, duplicateSourceId, duplicateTestTitle } from '@lib/tests/duplicate';
import { describe, expect, it } from 'bun:test';

function step(position: number, id: string, archived = false): ChainedAtc {
  return {
    position,
    step_id: `step-${position}`,
    id,
    slug: `ATC-${id}`,
    title: `ATC ${id}`,
    layer: 'UI',
    status: 'active',
    archived_at: archived ? '2026-11-20T10:00:00Z' : null,
    steps: [],
    assertions: [],
  };
}

describe('duplicateTestTitle', () => {
  it('prefixes the source title', () => {
    expect(duplicateTestTitle('Checkout as member')).toBe('Copy of Checkout as member');
  });

  it('keeps a 192-character source whole and cuts 193 and 200 to 200 characters', () => {
    expect(duplicateTestTitle('a'.repeat(192))).toBe(`Copy of ${'a'.repeat(192)}`);
    expect([...duplicateTestTitle('a'.repeat(193))]).toHaveLength(200);
    expect(duplicateTestTitle('a'.repeat(200))).toBe(`Copy of ${'a'.repeat(192)}`);
  });

  it('never splits an emoji and never ends in a space', () => {
    const emoji = duplicateTestTitle(`${'a'.repeat(191)}👍🏽tail`);
    expect(emoji.endsWith('a')).toBe(true);
    expect([...emoji].length).toBeLessThanOrEqual(200);
    const spaced = duplicateTestTitle(`${'a'.repeat(191)} tail`);
    expect(spaced).toBe(`Copy of ${'a'.repeat(191)}`);
  });
});

describe('duplicatePrefill', () => {
  it('carries the live chain in order, repeats included, and the tags', () => {
    const prefill = duplicatePrefill({
      title: 'Checkout as member',
      tags: ['smoke'],
      atcs: [step(3, 'c'), step(1, 'a'), step(2, 'b'), step(4, 'a')],
    });
    expect(prefill.title).toBe('Copy of Checkout as member');
    expect(prefill.chain.map(a => a.id)).toEqual(['a', 'b', 'c', 'a']);
    expect(prefill.chain[0]).toEqual({ id: 'a', slug: 'ATC-a', title: 'ATC a', layer: 'UI' });
    expect(prefill.tags).toEqual(['smoke']);
    expect(prefill.archivedStepCount).toBe(0);
  });

  it('leaves out every archived step and counts steps, not distinct ATCs', () => {
    const prefill = duplicatePrefill({
      title: 'T',
      tags: [],
      atcs: [step(1, 'a'), step(2, 'x', true), step(3, 'b'), step(4, 'x', true), step(5, 'c')],
    });
    expect(prefill.chain.map(a => a.id)).toEqual(['a', 'b', 'c']);
    expect(prefill.archivedStepCount).toBe(2);
  });

  it('opens an empty chain when every ATC is archived', () => {
    const prefill = duplicatePrefill({ title: 'T', tags: ['smoke'], atcs: [step(1, 'x', true)] });
    expect(prefill.chain).toEqual([]);
    expect(prefill.archivedStepCount).toBe(1);
  });

  it('carries a chain longer than the builder cap whole', () => {
    const atcs = Array.from({ length: 101 }, (_, i) => step(i + 1, `a${i}`));
    expect(duplicatePrefill({ title: 'T', tags: [], atcs }).chain).toHaveLength(101);
  });
});

describe('archivedStepsNotice', () => {
  it('says nothing when no step was left out', () => {
    expect(archivedStepsNotice(0)).toBeNull();
  });

  it('uses the singular and the plural wording', () => {
    expect(archivedStepsNotice(1)).toBe('1 chain step was left out because its ATC is archived.');
    expect(archivedStepsNotice(2)).toBe('2 chain steps were left out because their ATCs are archived.');
  });
});

describe('duplicateSourceId', () => {
  it('treats an absent or empty value as the blank builder', () => {
    expect(duplicateSourceId(undefined)).toBeNull();
    expect(duplicateSourceId('')).toBeNull();
    expect(duplicateSourceId('  ')).toBeNull();
  });

  it('passes any other value through, the first one when repeated', () => {
    expect(duplicateSourceId('not-a-uuid')).toBe('not-a-uuid');
    expect(duplicateSourceId(['a', 'b'])).toBe('a');
  });
});
