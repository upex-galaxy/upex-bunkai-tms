export const CI_PIPELINE_URL_MAX = 2048;
export const REPOSITORY_URL_MAX = 2048;
export const SHORT_COMMIT_LENGTH = 7;

export const REPOSITORY_HINT_ADMIN = 'Set the repository URL in Project settings to link commits.';
export const REPOSITORY_HINT_MEMBER = 'Ask a workspace admin to set the repository URL.';
export const REPOSITORY_URL_INVALID_MESSAGE
  = 'Enter an https repository URL on a supported host: GitHub (https://github.com/<owner>/<repo>) or GitLab (https://gitlab.com/<group>/<project>).';

export interface RunCiFields {
  commit?: string | null
  branch?: string | null
  pipeline_name?: string | null
  pipeline_url?: string | null
}

const PIPELINE_URL_SHAPE = /^https?:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/i;
const COMMIT_SHAPE = /^[0-9a-f]{7,64}$/i;
const PATH_SEGMENT = /^[\w.-]+$/;

function hasControlOrLineBreak(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1F || (code >= 0x7F && code <= 0x9F) || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

export function isCiPipelineUrl(value: string): boolean {
  if (Array.from(value).length > CI_PIPELINE_URL_MAX || hasControlOrLineBreak(value) || !PIPELINE_URL_SHAPE.test(value)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  }
  catch {
    return false;
  }
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '' && url.hostname !== '';
}

export type RepositoryHost = 'github' | 'gitlab';

const HOSTS: Record<string, { host: RepositoryHost, exactSegments: number | null }> = {
  'github.com': { host: 'github', exactSegments: 2 },
  'gitlab.com': { host: 'gitlab', exactSegments: null },
};

export type RepositoryUrlParse = { ok: true, value: string, host: RepositoryHost } | { ok: false, message: string };

export function parseRepositoryUrl(input: string): RepositoryUrlParse {
  const invalid: RepositoryUrlParse = { ok: false, message: REPOSITORY_URL_INVALID_MESSAGE };
  let candidate = input.trim().replace(/\/+$/, '');
  if (candidate.toLowerCase().endsWith('.git')) {
    candidate = candidate.slice(0, -4).replace(/\/+$/, '');
  }
  if (candidate.length === 0 || candidate.length > REPOSITORY_URL_MAX || /\s/.test(candidate) || hasControlOrLineBreak(candidate)) {
    return invalid;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  }
  catch {
    return invalid;
  }
  const rule = HOSTS[url.hostname];
  if (url.protocol !== 'https:' || !rule || url.port !== '' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    return invalid;
  }
  if (!/^https:\/\/[^/]+\//i.test(candidate)) {
    return invalid;
  }
  const segments = url.pathname.split('/').slice(1);
  const countOk = rule.exactSegments === null ? segments.length >= 2 : segments.length === rule.exactSegments;
  if (!countOk || segments.some(s => !PATH_SEGMENT.test(s) || s === '.' || s === '..')) {
    return invalid;
  }
  return { ok: true, value: `https://${url.hostname}/${segments.join('/')}`, host: rule.host };
}

export function shortCommit(commit: string): string {
  return commit.slice(0, SHORT_COMMIT_LENGTH);
}

export function commitUrl(repositoryUrl: string | null | undefined, commit: string): string | null {
  if (!repositoryUrl || !COMMIT_SHAPE.test(commit)) {
    return null;
  }
  const parsed = parseRepositoryUrl(repositoryUrl);
  if (!parsed.ok || parsed.value !== repositoryUrl) {
    return null;
  }
  return parsed.host === 'gitlab' ? `${parsed.value}/-/commit/${commit}` : `${parsed.value}/commit/${commit}`;
}

export function pipelineHref(url: string | null | undefined): string | null {
  return url && isCiPipelineUrl(url) ? url : null;
}

export function hasCiContext(run: RunCiFields): boolean {
  return Boolean(run.commit || run.branch || run.pipeline_name || pipelineHref(run.pipeline_url));
}

export function repositoryHint(canConfigure: boolean): string {
  return canConfigure ? REPOSITORY_HINT_ADMIN : REPOSITORY_HINT_MEMBER;
}
