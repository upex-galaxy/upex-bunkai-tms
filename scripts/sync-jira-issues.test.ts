/**
 * Regression coverage for BK-502 — `--include-comments` was accepted and silently
 * dropped for every non-coverable work type (`Bug`, `Improvement`), while the
 * coverable path (`Defect`) honoured it.
 *
 * These tests drive the REAL routing path (`routeIssueByKey` -> `syncStandaloneIssue`)
 * against a throwaway HTTP server speaking the Jira REST shapes the script consumes,
 * and against the REAL `.agents/jira-required.yaml` registry — so the `coverable:`
 * flags that decide the routing are the project's own, not a fixture.
 */
import type { Config, SyncOptions } from './sync-jira-issues.ts';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { emptyResult, routeIssueByKey } from './sync-jira-issues.ts';

const COMMENT_BODY = 'Activation still pending — cross-device sign-in broken in production';
const COMMENT_AUTHOR = 'QA Owner';

/** Minimal ADF doc: one paragraph of plain text. */
function adfParagraph(text: string) {
  return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

/** Jira issues this fake instance serves, keyed by issue key. */
const ISSUES: Record<string, { issuetype: string, summary: string }> = {
  'BK-9001': { issuetype: 'Bug', summary: 'Flat-file bug with a comment trail' },
  'BK-9002': { issuetype: 'Improvement', summary: 'Flat-file improvement with a comment trail' },
  'BK-9003': { issuetype: 'Defect', summary: 'Folder-layout defect control case' },
};

let server: ReturnType<typeof Bun.serve>;
let outputDir: string;

function config(): Config {
  return {
    baseUrl: server.url.origin,
    displayUrl: 'https://jira.example.test',
    email: 'sync@example.test',
    apiToken: 'not-a-real-token',
    project: 'BK',
    projectKeySource: 'project.yaml',
    instanceSource: 'project.yaml',
    instanceWarning: null,
    outputDir,
  };
}

function options(includeComments: boolean): SyncOptions {
  return { issueType: 'stories', includeComments, dryRun: false, json: true, noDefects: true };
}

beforeAll(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'bk502-sync-'));
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);

      if (/^\/rest\/api\/3\/issue\/[\w-]+\/comment$/.test(pathname)) {
        return Response.json({
          comments: [{
            id: '1',
            author: { displayName: COMMENT_AUTHOR },
            body: adfParagraph(COMMENT_BODY),
            created: '2026-08-17T10:00:00.000+0000',
            updated: '2026-08-17T10:00:00.000+0000',
          }],
        });
      }

      const issue = pathname.match(/^\/rest\/api\/3\/issue\/([\w-]+)$/);
      if (issue) {
        const key = issue[1];
        const meta = key ? ISSUES[key] : undefined;
        if (!key || !meta) { return new Response('not found', { status: 404 }); }
        return Response.json({
          key,
          fields: {
            summary: meta.summary,
            issuetype: { name: meta.issuetype },
            status: { name: 'In Progress' },
            priority: { name: 'Medium' },
            description: adfParagraph('Synthetic fixture issue.'),
            created: '2026-08-17T09:00:00.000+0000',
            updated: '2026-08-17T09:30:00.000+0000',
            reporter: { displayName: 'Reporter' },
            assignee: { displayName: 'Assignee' },
            issuelinks: [],
            labels: [],
            components: [],
          },
        });
      }

      // Coverage discovery (defect control case) issues a JQL search. These tests run
      // with `noDefects: true`, so the empty result is a deliberate no-op stub — it is
      // NOT a fixture for coverage discovery. Anything asserting on ATP/ATR/defect
      // nesting must serve real issues here instead of trusting this branch.
      if (pathname === '/rest/api/3/search/jql') {
        return Response.json({ issues: [], isLast: true });
      }

      return new Response('unhandled', { status: 500 });
    },
  });
});

afterAll(() => {
  void server?.stop(true);
  if (outputDir) { rmSync(outputDir, { recursive: true, force: true }); }
});

/** Reads the single flat file the sync writes for a `content: single` work type. */
function readFlatFile(subdir: string, prefix: string, key: string): string {
  const dir = join(outputDir, subdir);
  const name = new Bun.Glob(`${prefix}-${key}-*.md`).scanSync({ cwd: dir })[Symbol.iterator]().next();
  expect(name.done, `no ${prefix}-${key}-*.md written under ${subdir}/`).toBe(false);
  return readFileSync(join(dir, name.value as string), 'utf-8');
}

describe('sync-jira-issues --include-comments (BK-502)', () => {
  it('embeds the comment trail in the flat file of a Bug (coverable: false)', async () => {
    const result = emptyResult();
    await routeIssueByKey(config(), 'BK-9001', options(true), result);

    expect(result.warnings).toEqual([]);
    expect(result.synced.bugs).toBe(1);

    const md = readFlatFile('bugs', 'BUG', 'BK-9001');
    expect(md).toContain('## Comments');
    expect(md).toContain(COMMENT_AUTHOR);
    expect(md).toContain(COMMENT_BODY);
  });

  it('embeds the comment trail in the flat file of an Improvement (coverable defaults false)', async () => {
    const result = emptyResult();
    await routeIssueByKey(config(), 'BK-9002', options(true), result);

    expect(result.warnings).toEqual([]);
    expect(result.synced.improvements).toBe(1);

    const md = readFlatFile('improvements', 'IMPROVEMENT', 'BK-9002');
    expect(md).toContain('## Comments');
    expect(md).toContain(COMMENT_BODY);
  });

  it('omits the section when --include-comments is not passed', async () => {
    const result = emptyResult();
    await routeIssueByKey(config(), 'BK-9001', options(false), result);

    const md = readFlatFile('bugs', 'BUG', 'BK-9001');
    expect(md).not.toContain('## Comments');
    expect(md).not.toContain(COMMENT_BODY);
  });

  it('keeps the sync footer last so the file contract is unchanged', async () => {
    const result = emptyResult();
    await routeIssueByKey(config(), 'BK-9001', options(true), result);

    const md = readFlatFile('bugs', 'BUG', 'BK-9001');
    expect(md.trimEnd().endsWith('_Synced from Jira by sync-jira-issues_')).toBe(true);
    expect(md.indexOf('## Comments')).toBeGreaterThan(md.indexOf('## Metadata'));
    // A comment already closes with its own `---`; the section must not add a second.
    expect(md).not.toContain('---\n\n---');
  });

  it('control: a Defect (coverable: true) still gets its own comments.md', async () => {
    const result = emptyResult();
    await routeIssueByKey(config(), 'BK-9003', options(true), result);

    const dir = new Bun.Glob('DEFECT-BK-9003-*').scanSync({ cwd: join(outputDir, 'defects'), onlyFiles: false });
    const folder = dir[Symbol.iterator]().next();
    expect(folder.done).toBe(false);

    const md = readFileSync(join(outputDir, 'defects', folder.value as string, 'comments.md'), 'utf-8');
    expect(md).toContain(COMMENT_BODY);
  });
});
