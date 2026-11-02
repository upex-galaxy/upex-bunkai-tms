import { describe, expect, it } from 'bun:test';
import { resolveProjectSectionLabel } from './project-sub-nav';

// BK-666 (AC-01) — the Tests entry is the current section on the list and on
// the routes nested under it; the other entries keep their own rules.

describe('resolveProjectSectionLabel', () => {
  const slug = 'checkout';

  it('marks Tests current on the Tests list, direct navigation included (E19)', () => {
    expect(resolveProjectSectionLabel('/projects/checkout/tests', slug)).toBe('Tests');
  });

  it('keeps Tests current on a Test, its run history and New Test', () => {
    expect(resolveProjectSectionLabel('/projects/checkout/tests/abc', slug)).toBe('Tests');
    expect(resolveProjectSectionLabel('/projects/checkout/tests/abc/runs', slug)).toBe('Tests');
    expect(resolveProjectSectionLabel('/projects/checkout/tests/new', slug)).toBe('Tests');
  });

  it('does not over-match a segment that merely starts with "tests"', () => {
    expect(resolveProjectSectionLabel('/projects/checkout/tests-archive', slug)).toBeNull();
  });

  it('leaves the other sections as they were', () => {
    expect(resolveProjectSectionLabel('/projects/checkout', slug)).toBe('All ATCs');
    expect(resolveProjectSectionLabel('/projects/checkout/atcs/abc', slug)).toBeNull();
    expect(resolveProjectSectionLabel('/projects/checkout/runs/abc', slug)).toBe('Test Runs');
    expect(resolveProjectSectionLabel('/projects/checkout/traceability', slug)).toBe('Traceability');
  });
});
