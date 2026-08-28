import { describe, expect, it } from 'bun:test';
import { parseTestSearchParams, TEST_SEARCH_LIMIT_DEFAULT, TEST_SEARCH_LIMIT_MAX } from './search-validation';

function params(entries: Record<string, string>): URLSearchParams {
  return new URLSearchParams(entries);
}

describe('parseTestSearchParams', () => {
  const projectId = '123e4567-e89b-12d3-a456-426614174000';

  it('parses a valid query + project_id, defaulting limit', () => {
    const result = parseTestSearchParams(params({ query: 'checkout', project_id: projectId }));
    expect(result.query).toBe('checkout');
    expect(result.project_id).toBe(projectId);
    expect(result.limit).toBe(TEST_SEARCH_LIMIT_DEFAULT);
  });

  it('trims query and rejects an empty (whitespace-only) query', () => {
    expect(() => parseTestSearchParams(params({ query: '   ', project_id: projectId }))).toThrow();
  });

  it('rejects a missing project_id', () => {
    expect(() => parseTestSearchParams(params({ query: 'checkout' }))).toThrow();
  });

  it('rejects a non-uuid project_id', () => {
    expect(() => parseTestSearchParams(params({ query: 'checkout', project_id: 'not-a-uuid' }))).toThrow();
  });

  it('rejects limit above the max', () => {
    expect(() => parseTestSearchParams(params({
      query: 'checkout',
      project_id: projectId,
      limit: String(TEST_SEARCH_LIMIT_MAX + 1),
    }))).toThrow();
  });

  it('rejects limit below 1', () => {
    expect(() => parseTestSearchParams(params({ query: 'checkout', project_id: projectId, limit: '0' }))).toThrow();
  });
});
