import { parseWorkspaceBugsParams } from '@lib/bugs/workspace-bugs-validation';
import { describe, expect, test } from 'bun:test';
import { ZodError } from 'zod';

// BK-555 — the query string of GET /api/v1/workspaces/{id}/bugs.

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function parse(query: string) {
  return parseWorkspaceBugsParams(new URLSearchParams(query));
}

describe('parseWorkspaceBugsParams', () => {
  test('no parameters: every filter absent, page size 50', () => {
    expect(parse('')).toEqual({ limit: 50 });
  });

  test('Project, comma-list statuses and severities, limit and cursor', () => {
    expect(parse(`project_id=${PROJECT_ID}&status=open,in_progress&severity=P1,P4&limit=10&cursor=abc`)).toEqual({
      project_id: PROJECT_ID,
      status: ['open', 'in_progress'],
      severity: ['P1', 'P4'],
      limit: 10,
      cursor: 'abc',
    });
  });

  test('blank items inside a comma list are ignored', () => {
    expect(parse('status=open,,closed,').status).toEqual(['open', 'closed']);
  });

  test.each([
    ['project_id=not-a-uuid'],
    ['status=in-progress'],
    ['status='],
    ['severity=P9'],
    ['limit=0'],
    ['limit=51'],
    ['limit=abc'],
  ])('refuses %s with a validation error (422)', (query) => {
    expect(() => parse(query)).toThrow(ZodError);
  });
});
