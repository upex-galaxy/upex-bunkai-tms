import { describe, expect, it } from 'bun:test';
import { isTestChainInProject } from './project-scope';

// BK-620 — the ALL-match rule a Test's Project is derived by (0076's rule).
describe('BK-620 — isTestChainInProject', () => {
  it('a chain whose every ATC is in the Project belongs to it', () => {
    expect(isTestChainInProject(['p-a'], 'p-a')).toBe(true);
    expect(isTestChainInProject(['p-a', 'p-a', 'p-a'], 'p-a')).toBe(true);
  });

  it('a chain whose ATCs are in another Project does not belong to this one', () => {
    expect(isTestChainInProject(['p-a'], 'p-b')).toBe(false);
  });

  it('a chain spanning two Projects belongs to neither', () => {
    expect(isTestChainInProject(['p-a', 'p-b'], 'p-a')).toBe(false);
    expect(isTestChainInProject(['p-a', 'p-b'], 'p-b')).toBe(false);
  });

  it('an empty chain belongs to no Project', () => {
    expect(isTestChainInProject([], 'p-a')).toBe(false);
  });

  it('an unreadable chained ATC fails closed', () => {
    expect(isTestChainInProject(['p-a', null], 'p-a')).toBe(false);
    expect(isTestChainInProject([undefined], 'p-a')).toBe(false);
  });
});
