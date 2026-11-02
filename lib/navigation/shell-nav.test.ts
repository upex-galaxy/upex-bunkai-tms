import {
  activeProjectSection,
  isProjectsNavActive,
  projectSectionHref,
  resolveNavProjectSlug,
} from '@lib/navigation/shell-nav';
import { describe, expect, test } from 'bun:test';

// BK-1557 — the global sidebar's Test Runs / Bug Reports / Metrics entries
// link into a project (D52). These cover the pure decisions the sidebar
// renders: which project, which href, which entry is current.

const PROJECTS = [{ slug: 'checkout' }, { slug: 'billing' }];

describe('resolveNavProjectSlug', () => {
  test('uses the project in the URL when it belongs to the workspace', () => {
    expect(resolveNavProjectSlug('/projects/billing/atcs/abc', PROJECTS)).toBe('billing');
  });

  test('falls back to the first project outside a project route', () => {
    expect(resolveNavProjectSlug('/home', PROJECTS)).toBe('checkout');
    expect(resolveNavProjectSlug('/projects', PROJECTS)).toBe('checkout');
  });

  test('ignores a slug that is not a project of the workspace', () => {
    expect(resolveNavProjectSlug('/projects/new', PROJECTS)).toBe('checkout');
    expect(resolveNavProjectSlug('/projects/deleted-one/runs', PROJECTS)).toBe('checkout');
  });

  test('returns null when the workspace has no project', () => {
    expect(resolveNavProjectSlug('/home', [])).toBeNull();
    expect(resolveNavProjectSlug('/projects/checkout', [])).toBeNull();
  });
});

describe('projectSectionHref', () => {
  test('builds the project-scoped route', () => {
    expect(projectSectionHref('checkout', 'runs')).toBe('/projects/checkout/runs');
    expect(projectSectionHref('checkout', 'bugs')).toBe('/projects/checkout/bugs');
    expect(projectSectionHref('checkout', 'metrics')).toBe('/projects/checkout/metrics');
  });

  test('has no href without a project', () => {
    expect(projectSectionHref(null, 'runs')).toBeNull();
  });
});

describe('activeProjectSection', () => {
  test('matches each section and its nested routes', () => {
    expect(activeProjectSection('/projects/checkout/runs')).toBe('runs');
    expect(activeProjectSection('/projects/checkout/runs/r-1')).toBe('runs');
    expect(activeProjectSection('/projects/checkout/bugs/b-1')).toBe('bugs');
    expect(activeProjectSection('/projects/checkout/metrics')).toBe('metrics');
  });

  test('does not match a Test run history or look-alike segments', () => {
    expect(activeProjectSection('/projects/checkout/tests/t-1/runs')).toBeNull();
    expect(activeProjectSection('/projects/checkout/runsheet')).toBeNull();
    expect(activeProjectSection('/projects/checkout')).toBeNull();
  });
});

describe('isProjectsNavActive', () => {
  test('is current on the index, a project and its other routes', () => {
    expect(isProjectsNavActive('/projects')).toBe(true);
    expect(isProjectsNavActive('/projects/checkout')).toBe(true);
    expect(isProjectsNavActive('/projects/checkout/traceability')).toBe(true);
  });

  test('yields to the section entries so two entries never highlight together', () => {
    expect(isProjectsNavActive('/projects/checkout/runs')).toBe(false);
    expect(isProjectsNavActive('/projects/checkout/bugs/b-1')).toBe(false);
  });

  test('is not current elsewhere', () => {
    expect(isProjectsNavActive('/home')).toBe(false);
    expect(isProjectsNavActive('/projects-archive')).toBe(false);
  });
});
