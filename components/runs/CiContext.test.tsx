import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CiContextRow, CiRefs } from './CiContext';

const REPO = 'https://github.com/acme/web-store';
const SETTINGS = '/projects/web-store/settings';
const R3 = { commit: 'a1b2c3d', branch: 'feature/checkout-discounts', pipeline_name: 'nightly-regression', pipeline_url: 'https://ci.acme.dev/p/42' };

function row(run: Parameters<typeof CiContextRow>[0]['run'], repositoryUrl: string | null = REPO, canConfigureRepository = false) {
  return renderToStaticMarkup(
    <CiContextRow run={run} repositoryUrl={repositoryUrl} canConfigureRepository={canConfigureRepository} settingsHref={SETTINGS} />,
  );
}

describe('CiContextRow', () => {
  it('1.1: shows the branch, the short commit linked to the repository host and the pipeline', () => {
    const html = row(R3);
    expect(html).toContain('CI context');
    expect(html).toContain('feature/checkout-discounts');
    expect(html).toContain('href="https://github.com/acme/web-store/commit/a1b2c3d"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('nightly-regression');
  });

  it('1.2: links the pipeline name only when a pipeline URL exists', () => {
    expect(row(R3)).toContain('href="https://ci.acme.dev/p/42"');
    const nameOnly = row({ pipeline_name: 'nightly-regression' });
    expect(nameOnly).toContain('nightly-regression');
    expect(nameOnly).not.toContain('href=');
  });

  it('1.3: renders only the fields the run carries', () => {
    const branchOnly = row({ branch: 'main' });
    expect(branchOnly).toContain('data-testid="ci-branch"');
    expect(branchOnly).not.toContain('data-testid="ci-commit"');
    expect(branchOnly).not.toContain('data-testid="ci-pipeline"');
    const commitOnly = row({ commit: '9f8e7d6' });
    expect(commitOnly).toContain('data-testid="ci-commit"');
    expect(commitOnly).not.toContain('data-testid="ci-branch"');
  });

  it('1.5: shows seven characters and links the full value', () => {
    const full = '0123456789abcdef0123456789abcdef01234567';
    const html = row({ commit: full });
    expect(html).toContain(`href="https://github.com/acme/web-store/commit/${full}"`);
    expect(html.replace(/<[^>]+>/g, '')).toBe('CI context0123456');
  });

  it('1.6: renders hostile text inert', () => {
    const html = row({ branch: '<img src=x onerror=alert(1)>', pipeline_name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('1.7: never renders a non-http(s) pipeline URL as a link', () => {
    const html = row({ pipeline_name: 'nightly', pipeline_url: 'javascript:alert(1)' });
    expect(html).toContain('nightly');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('href=');
  });

  it('4.1: renders nothing for a run without CI fields', () => {
    expect(row({})).toBe('');
    expect(row({ commit: null, branch: null, pipeline_name: null, pipeline_url: null })).toBe('');
  });

  it('5.1: without a repository URL the commit is plain text and the hint follows the role', () => {
    const member = row(R3, null, false);
    expect(member).toContain('data-linked="false"');
    expect(member).not.toContain('/commit/');
    expect(member).toContain('Ask a workspace admin to set the repository URL.');

    const admin = row(R3, null, true);
    expect(admin).toContain(`href="${SETTINGS}"`);
    expect(admin.replace(/<[^>]+>/g, '')).toContain('Set the repository URL in Project settings to link commits.');
  });

  it('5.5: a GitLab repository builds the /-/commit link', () => {
    expect(row({ commit: 'a1b2c3d' }, 'https://gitlab.com/acme/web-store')).toContain('href="https://gitlab.com/acme/web-store/-/commit/a1b2c3d"');
  });
});

describe('CiRefs', () => {
  it('3.1: shows branch and commit side by side', () => {
    const html = renderToStaticMarkup(<CiRefs run={{ branch: 'main', commit: 'a1b2c3d' }} repositoryUrl={REPO} testIdPrefix="row" />);
    expect(html).toContain('data-testid="row-branch"');
    expect(html).toContain('data-testid="row-commit"');
    expect(html).toContain('/commit/a1b2c3d');
  });

  it('3.2: renders nothing for a run without branch or commit', () => {
    expect(renderToStaticMarkup(<CiRefs run={{}} repositoryUrl={REPO} testIdPrefix="row" />)).toBe('');
  });
});
