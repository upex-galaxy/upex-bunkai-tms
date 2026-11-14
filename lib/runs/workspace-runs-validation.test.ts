import { WORKSPACE_RUNS_PAGE_SIZE } from '@lib/runs/workspace-runs-constants';
import { parseWorkspaceRunsParams } from '@lib/runs/workspace-runs-validation';
import { describe, expect, test } from 'bun:test';

// BK-513 — query-string validation for GET /api/v1/workspaces/{id}/runs.

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function parse(query: string) {
  return parseWorkspaceRunsParams(new URLSearchParams(query));
}

describe('parseWorkspaceRunsParams', () => {
  test('an empty query applies no filter and the default page size of 50', () => {
    const parsed = parse('');
    expect(parsed.limit).toBe(WORKSPACE_RUNS_PAGE_SIZE);
    expect(WORKSPACE_RUNS_PAGE_SIZE).toBe(50);
    expect(parsed.project_id).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.environment).toBeUndefined();
    expect(parsed.mode).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
  });

  test('all four filters compose in one query', () => {
    const parsed = parse(`project_id=${PROJECT_ID}&status=passed&status=failed&environment=staging&mode=automated&limit=10&cursor=abc`);
    expect(parsed).toEqual({
      project_id: PROJECT_ID,
      status: ['passed', 'failed'],
      environment: 'staging',
      mode: 'automated',
      limit: 10,
      cursor: 'abc',
    });
  });

  test('running is not an outcome to filter by (AC-09)', () => {
    expect(() => parse('status=running')).toThrow();
  });

  test('aborted is not offered as an outcome filter (AC-08)', () => {
    expect(() => parse('status=aborted')).toThrow();
  });

  test('mode accepts manual and automated only, not an executor value', () => {
    expect(parse('mode=manual').mode).toBe('manual');
    expect(() => parse('mode=human')).toThrow();
  });

  test('a project id must be a uuid', () => {
    expect(() => parse('project_id=not-a-uuid')).toThrow();
  });

  test('the environment name is trimmed, and a blank or oversized one is refused', () => {
    expect(parse('environment=%20Staging%20').environment).toBe('Staging');
    expect(() => parse('environment=%20%20')).toThrow();
    expect(() => parse(`environment=${'x'.repeat(101)}`)).toThrow();
  });

  test('a limit out of 1..50 is refused, never clamped', () => {
    expect(parse('limit=1').limit).toBe(1);
    expect(parse('limit=50').limit).toBe(50);
    expect(() => parse('limit=0')).toThrow();
    expect(() => parse('limit=51')).toThrow();
    expect(() => parse('limit=2.5')).toThrow();
  });
});
