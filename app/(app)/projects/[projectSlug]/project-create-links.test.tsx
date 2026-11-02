import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectCreateLinks } from './project-create-links';

// BK-666 (AC-08) — the project header offers New ATC and New Test only to roles
// that can create; a viewer gets neither.

describe('ProjectCreateLinks', () => {
  it('offers New ATC and New Test to a role that can create', () => {
    const html = renderToStaticMarkup(<ProjectCreateLinks projectSlug="checkout" canCreate />);
    expect(html).toContain('href="/projects/checkout/atcs/new"');
    expect(html).toContain('href="/projects/checkout/tests/new"');
  });

  it('offers a viewer no create affordance', () => {
    expect(renderToStaticMarkup(<ProjectCreateLinks projectSlug="checkout" canCreate={false} />)).toBe('');
  });
});
