import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { projectIdFrom, viewIdFrom } from './params';

// BK-443 — path-id parsing for the saved-views routes.

const PROJECT = '22222222-2222-4222-8222-222222222222';
const VIEW = '33333333-3333-4333-8333-333333333333';

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('projectIdFrom', () => {
  test('reads the project id from the collection path', () => {
    expect(projectIdFrom(request(`/api/v1/projects/${PROJECT}/saved-views?view_kind=bugs`))).toBe(PROJECT);
  });

  test('reads the project id from the item path', () => {
    expect(projectIdFrom(request(`/api/v1/projects/${PROJECT}/saved-views/${VIEW}`))).toBe(PROJECT);
  });

  test('refuses a project id that is not a uuid with a 400', () => {
    expect(() => projectIdFrom(request('/api/v1/projects/not-a-uuid/saved-views'))).toThrow(ApiError);
    try {
      projectIdFrom(request('/api/v1/projects/not-a-uuid/saved-views'));
    }
    catch (error) {
      expect((error as ApiError).status).toBe(400);
    }
  });
});

describe('viewIdFrom', () => {
  test('reads the view id from the last segment', () => {
    expect(viewIdFrom(request(`/api/v1/projects/${PROJECT}/saved-views/${VIEW}`))).toBe(VIEW);
  });

  test('refuses a view id that is not a uuid with a 400', () => {
    try {
      viewIdFrom(request(`/api/v1/projects/${PROJECT}/saved-views/42`));
      throw new Error('expected a 400');
    }
    catch (error) {
      expect((error as ApiError).status).toBe(400);
    }
  });
});
