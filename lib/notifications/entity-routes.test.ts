import { buildEntityHref, resolveNotificationHref } from '@lib/notifications/entity-routes';
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

  test('a run-linked bug with entity_available + project_slug resolves the defect detail route, regardless of run_id in the payload', () => {
    const href = resolveNotificationHref({
      entity_type: 'bug',
      entity_id: 'bug-1',
      entity_available: true,
      payload: { project_slug: 'checkout-platform', run_id: 'run-1' },
    });
    expect(href).toBe('/projects/checkout-platform/bugs/bug-1');
  });

  test('a standalone bug (no run_id in payload) ALSO resolves the defect detail route — BK-337 gives it a working destination for the first time', () => {
    const href = resolveNotificationHref({
      entity_type: 'bug',
      entity_id: 'bug-1',
      entity_available: true,
      payload: { project_slug: 'checkout-platform' },
    });
    expect(href).toBe('/projects/checkout-platform/bugs/bug-1');
  });

  test('bug entity_available: false never resolves a route, regardless of run_id', () => {
    const href = resolveNotificationHref({
      entity_type: 'bug',
      entity_id: 'bug-1',
      entity_available: false,
      payload: { project_slug: 'checkout-platform', run_id: 'run-1' },
    });
    expect(href).toBeNull();
  });

  test('a bugId containing "/", "?", or ".." is percent-encoded, not interpolated raw', () => {
    const maliciousBugId = '../evil?x=1';
    const href = resolveNotificationHref({
      entity_type: 'bug',
      entity_id: maliciousBugId,
      entity_available: true,
      payload: { project_slug: 'checkout-platform', run_id: 'run-1' },
    });
    expect(href).toBe(`/projects/checkout-platform/bugs/${encodeURIComponent(maliciousBugId)}`);
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

  test('a project_slug containing "/", "?", or ".." is percent-encoded, not interpolated raw', () => {
    const maliciousSlug = '../../etc?x=1';
    const href = resolveNotificationHref({
      entity_type: 'run',
      entity_id: 'run-1',
      entity_available: true,
      payload: { project_slug: maliciousSlug },
    });
    expect(href).toBe(`/projects/${encodeURIComponent(maliciousSlug)}/runs/run-1`);
    // Proves the route keeps its expected shape (no extra "/" segments
    // sneaked in from the payload) rather than only checking the string.
    expect(href?.split('/')).toHaveLength(5);
  });
});

// BK-398 — the Command Palette's route builder. `buildEntityHref` is the
// shared core `resolveNotificationHref` (above) now wraps; comment 12407's
// final destination contract, verbatim: ATC/Test/Bug/Run are id-keyed under
// the project, Project is slug-only (the one exception), Module is an
// id-keyed query param (NOT `?modulePath=`, the shift-left draft's original
// answer that the AI Product Owner ruling corrected).
describe('buildEntityHref', () => {
  test('atc resolves /projects/{slug}/atcs/{id}', () => {
    expect(buildEntityHref('atc', { projectSlug: 'checkout-platform', entityId: 'atc-1' }))
      .toBe('/projects/checkout-platform/atcs/atc-1');
  });

  test('test resolves /projects/{slug}/tests/{id}', () => {
    expect(buildEntityHref('test', { projectSlug: 'checkout-platform', entityId: 'test-1' }))
      .toBe('/projects/checkout-platform/tests/test-1');
  });

  test('project resolves /projects/{slug} — slug-keyed, the one type with no entity id in the path', () => {
    expect(buildEntityHref('project', { projectSlug: 'checkout-platform', entityId: 'project-1' }))
      .toBe('/projects/checkout-platform');
  });

  test('module resolves /projects/{slug}?module={id} — id-keyed, NOT ?modulePath=', () => {
    const href = buildEntityHref('module', { projectSlug: 'checkout-platform', entityId: 'module-1' });
    expect(href).toBe('/projects/checkout-platform?module=module-1');
    expect(href).not.toContain('modulePath');
  });

  test('bug resolves the defect detail record /projects/{slug}/bugs/{id}, not a filtered list', () => {
    const href = buildEntityHref('bug', { projectSlug: 'checkout-platform', entityId: 'bug-1' });
    expect(href).toBe('/projects/checkout-platform/bugs/bug-1');
    expect(href).not.toContain('?bugId=');
  });

  test('run resolves /projects/{slug}/runs/{id}', () => {
    expect(buildEntityHref('run', { projectSlug: 'checkout-platform', entityId: 'run-1' }))
      .toBe('/projects/checkout-platform/runs/run-1');
  });

  test('the project slug is percent-encoded for every entity type, not just the ones resolveNotificationHref already covered', () => {
    const maliciousSlug = '../../etc?x=1';
    const href = buildEntityHref('atc', { projectSlug: maliciousSlug, entityId: 'atc-1' });
    expect(href).toBe(`/projects/${encodeURIComponent(maliciousSlug)}/atcs/atc-1`);
  });

  test('the module id is percent-encoded in the query param, not interpolated raw', () => {
    const maliciousId = '1&admin=true';
    const href = buildEntityHref('module', { projectSlug: 'checkout-platform', entityId: maliciousId });
    expect(href).toBe(`/projects/checkout-platform?module=${encodeURIComponent(maliciousId)}`);
  });
});
