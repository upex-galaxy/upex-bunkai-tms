import { describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const router = { push: () => {}, refresh: () => {} };
void mock.module('next/navigation', () => ({
  useRouter: () => router,
}));

const { ReadOnlyExplorerHint, ReadOnlyProjectNotice } = await import('@components/billing/ReadOnlyProjectNotice');
const { Sidebar } = await import('@components/layout/Sidebar');

const WHY = 'This project is read-only because the workspace is over its plan&#x27;s project limit.';

describe('ReadOnlyProjectNotice', () => {
  test('owner: why, how to restore, and the billing link', () => {
    const html = renderToStaticMarkup(createElement(ReadOnlyProjectNotice, { audience: 'owner' }));
    expect(html).toContain('nothing was deleted. Update the billing plan in Billing to edit it again.');
    expect(html).toContain('data-testid="project-read-only-billing"');
  });

  test('admin: asks the owner and keeps the billing link an admin can open', () => {
    const html = renderToStaticMarkup(createElement(ReadOnlyProjectNotice, { audience: 'admin' }));
    expect(html).toContain('Ask the workspace owner to update the billing plan to edit it again.');
    expect(html).toContain('href="/settings/billing"');
  });

  test('member or viewer: asks the owner and gets no link to a page they cannot open', () => {
    const html = renderToStaticMarkup(createElement(ReadOnlyProjectNotice, { audience: 'other' }));
    expect(html).toContain('Ask the workspace owner to update the billing plan to edit it again.');
    expect(html).not.toContain('<a');
  });
});

describe('read-only explorer empty state', () => {
  function renderEmpty(audience: 'owner' | 'admin' | 'other') {
    return renderToStaticMarkup(createElement(Sidebar, {
      projectSlug: 'checkout',
      projectName: 'Checkout',
      tree: [],
      canCreate: false,
      emptyHint: createElement(ReadOnlyExplorerHint, { audience }),
    }));
  }

  test('owner: explains the lock and offers Open billing, never "ask a member"', () => {
    const html = renderEmpty('owner');
    expect(html).toContain('No modules yet');
    expect(html).toContain(WHY);
    expect(html).toContain('Update the billing plan in Billing to edit it again.');
    expect(html).toContain('data-testid="modules-empty-billing"');
    expect(html).toContain('href="/settings/billing"');
    expect(html).not.toContain('Ask a workspace member');
  });

  test('admin: asks the owner, no billing button', () => {
    const html = renderEmpty('admin');
    expect(html).toContain('Ask the workspace owner to update the billing plan to edit it again.');
    expect(html).not.toContain('modules-empty-billing');
  });

  test('member or viewer: asks the owner, no billing button', () => {
    const html = renderEmpty('other');
    expect(html).toContain('Ask the workspace owner to update the billing plan to edit it again.');
    expect(html).not.toContain('modules-empty-billing');
  });

  test('an editable project keeps the original viewer copy', () => {
    const html = renderToStaticMarkup(createElement(Sidebar, { projectSlug: 'checkout', projectName: 'Checkout', tree: [], canCreate: false }));
    expect(html).toContain('Ask a workspace member to add one.');
  });
});
