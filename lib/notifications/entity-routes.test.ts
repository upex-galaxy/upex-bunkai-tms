import { resolveNotificationHref } from '@lib/notifications/entity-routes';
import { describe, expect, test } from 'bun:test';

describe('resolveNotificationHref', () => {
  test('a run with entity_available + a project_slug in payload resolves the run route', () => {
    const href = resolveNotificationHref({
      entity_type: 'run',
      entity_id: 'run-1',
      entity_available: true,
      payload: { project_slug: 'checkout-platform' },
    });
    expect(href).toBe('/projects/checkout-platform/runs/run-1');
  });

  test('a test with entity_available + a project_slug in payload resolves the test route', () => {
    const href = resolveNotificationHref({
      entity_type: 'test',
      entity_id: 'test-1',
      entity_available: true,
      payload: { project_slug: 'checkout-platform' },
    });
    expect(href).toBe('/projects/checkout-platform/tests/test-1');
  });

  test('entity_available: false never resolves a route, regardless of payload', () => {
    const href = resolveNotificationHref({
      entity_type: 'run',
      entity_id: 'run-1',
      entity_available: false,
      payload: { project_slug: 'checkout-platform' },
    });
    expect(href).toBeNull();
  });

  test('bug is deliberately unmapped even when available + payload looks complete (no BK-31 route yet)', () => {
    const href = resolveNotificationHref({
      entity_type: 'bug',
      entity_id: 'bug-1',
      entity_available: true,
      payload: { project_slug: 'checkout-platform' },
    });
    expect(href).toBeNull();
  });

  test('a missing project_slug in payload resolves no route (today\'s producers do not populate it yet)', () => {
    const href = resolveNotificationHref({
      entity_type: 'run',
      entity_id: 'run-1',
      entity_available: true,
      payload: { marker: 'no-project-slug' },
    });
    expect(href).toBeNull();
  });

  test('a null entity_id never resolves a route', () => {
    const href = resolveNotificationHref({
      entity_type: 'run',
      entity_id: null,
      entity_available: true,
      payload: { project_slug: 'checkout-platform' },
    });
    expect(href).toBeNull();
  });
});
