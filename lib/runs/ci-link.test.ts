import { describe, expect, it } from 'bun:test';
import {
  commitUrl,
  hasCiContext,
  isCiPipelineUrl,
  parseRepositoryUrl,
  pipelineHref,
  REPOSITORY_HINT_ADMIN,
  REPOSITORY_HINT_MEMBER,
  REPOSITORY_URL_INVALID_MESSAGE,
  repositoryHint,
  shortCommit,
} from './ci-link';

describe('parseRepositoryUrl', () => {
  it('should store a GitHub URL without the trailing slash', () => {
    expect(parseRepositoryUrl('https://github.com/acme/web-store/')).toEqual({ ok: true, value: 'https://github.com/acme/web-store', host: 'github' });
  });

  it('should drop the .git suffix', () => {
    expect(parseRepositoryUrl('https://github.com/acme/web-store.git')).toEqual({ ok: true, value: 'https://github.com/acme/web-store', host: 'github' });
    expect(parseRepositoryUrl('  https://github.com/acme/web-store.git/  ')).toEqual({ ok: true, value: 'https://github.com/acme/web-store', host: 'github' });
  });

  it('should accept a GitLab project inside nested groups', () => {
    expect(parseRepositoryUrl('https://gitlab.com/acme/platform/web-store')).toEqual({ ok: true, value: 'https://gitlab.com/acme/platform/web-store', host: 'gitlab' });
  });

  it('should lowercase the host', () => {
    expect(parseRepositoryUrl('https://GitHub.com/acme/web-store')).toEqual({ ok: true, value: 'https://github.com/acme/web-store', host: 'github' });
  });

  it.each([
    ['http://github.com/x/y'],
    ['github.com/x/y'],
    ['https://'],
    ['https://bitbucket.org/acme/web-store'],
    ['https://github.example.com/acme/web-store'],
    ['https://github.com/acme'],
    ['https://github.com/acme/web-store/tree/main'],
    ['https://gitlab.com/acme'],
    ['https://github.com/acme/web-store?tab=readme'],
    ['https://github.com/acme/web-store#readme'],
    ['https://user:pass@github.com/acme/web-store'],
    ['https://github.com:8443/acme/web-store'],
    ['https://github.com/acme/web store'],
    ['javascript:alert(1)'],
    [''],
  ])('should reject %p with the supported-hosts message', (input) => {
    expect(parseRepositoryUrl(input)).toEqual({ ok: false, message: REPOSITORY_URL_INVALID_MESSAGE });
  });

  it('should reject a URL over 2048 characters', () => {
    expect(parseRepositoryUrl(`https://gitlab.com/acme/${'a'.repeat(2048)}`).ok).toBe(false);
  });

  it('should name both supported hosts in the rejection message', () => {
    expect(REPOSITORY_URL_INVALID_MESSAGE).toContain('GitHub');
    expect(REPOSITORY_URL_INVALID_MESSAGE).toContain('GitLab');
  });
});

describe('commitUrl', () => {
  it('should link a GitHub commit with the full value', () => {
    expect(commitUrl('https://github.com/acme/web-store', 'a1b2c3d')).toBe('https://github.com/acme/web-store/commit/a1b2c3d');
    const full = 'a'.repeat(40);
    expect(commitUrl('https://github.com/acme/web-store', full)).toBe(`https://github.com/acme/web-store/commit/${full}`);
  });

  it('should link a GitLab commit with the /-/commit path', () => {
    expect(commitUrl('https://gitlab.com/acme/web-store', 'a1b2c3d')).toBe('https://gitlab.com/acme/web-store/-/commit/a1b2c3d');
  });

  it('should not link without a repository URL', () => {
    expect(commitUrl(null, 'a1b2c3d')).toBeNull();
    expect(commitUrl('', 'a1b2c3d')).toBeNull();
  });

  it('should not link a stored value that is not a normalized supported URL', () => {
    expect(commitUrl('javascript:alert(1)', 'a1b2c3d')).toBeNull();
    expect(commitUrl('https://github.com/acme/web-store/', 'a1b2c3d')).toBeNull();
  });

  it('should not link a commit that is not hexadecimal', () => {
    expect(commitUrl('https://github.com/acme/web-store', '../../x')).toBeNull();
  });
});

describe('isCiPipelineUrl and pipelineHref', () => {
  it('should accept http and https URLs', () => {
    expect(isCiPipelineUrl('https://ci.acme.dev/p/42')).toBe(true);
    expect(isCiPipelineUrl('http://ci.acme.dev/p/42')).toBe(true);
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['https://user:pw@ci.acme.dev/p/42'],
    ['https://ci.acme.dev/p 42'],
    [`https://ci.acme.dev/${'a'.repeat(2048)}`],
  ])('should refuse %p', (value) => {
    expect(isCiPipelineUrl(value)).toBe(false);
    expect(pipelineHref(value)).toBeNull();
  });

  it('should return no href for a missing URL', () => {
    expect(pipelineHref(null)).toBeNull();
  });
});

describe('shortCommit, hasCiContext and repositoryHint', () => {
  it('should keep the first seven characters', () => {
    expect(shortCommit('9f8e7d6c5b4a')).toBe('9f8e7d6');
  });

  it('should report a context for any single field', () => {
    expect(hasCiContext({ branch: 'main' })).toBe(true);
    expect(hasCiContext({ commit: 'a1b2c3d' })).toBe(true);
    expect(hasCiContext({ pipeline_name: 'nightly' })).toBe(true);
    expect(hasCiContext({ pipeline_url: 'https://ci.acme.dev/p/42' })).toBe(true);
  });

  it('should report no context for a run without fields or with only an unsafe pipeline URL', () => {
    expect(hasCiContext({})).toBe(false);
    expect(hasCiContext({ commit: null, branch: null, pipeline_name: null, pipeline_url: null })).toBe(false);
    expect(hasCiContext({ pipeline_url: 'javascript:alert(1)' })).toBe(false);
  });

  it('should pick the hint copy by role', () => {
    expect(repositoryHint(true)).toBe(REPOSITORY_HINT_ADMIN);
    expect(repositoryHint(false)).toBe(REPOSITORY_HINT_MEMBER);
    expect(REPOSITORY_HINT_ADMIN).toBe('Set the repository URL in Project settings to link commits.');
    expect(REPOSITORY_HINT_MEMBER).toBe('Ask a workspace admin to set the repository URL.');
  });
});
