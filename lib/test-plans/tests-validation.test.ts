import { describe, expect, it } from 'bun:test';
import { TestPlanAddTestsBodySchema } from './tests-validation';

describe('TestPlanAddTestsBodySchema', () => {
  it('accepts one or more uuids', () => {
    const result = TestPlanAddTestsBodySchema.safeParse({
      test_ids: ['123e4567-e89b-12d3-a456-426614174000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty array', () => {
    const result = TestPlanAddTestsBodySchema.safeParse({ test_ids: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid element', () => {
    const result = TestPlanAddTestsBodySchema.safeParse({ test_ids: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing test_ids field', () => {
    const result = TestPlanAddTestsBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('allows duplicate ids in the array — dedup is the RPC\'s job, not validation\'s', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const result = TestPlanAddTestsBodySchema.safeParse({ test_ids: [id, id] });
    expect(result.success).toBe(true);
  });
});
