import type { JiraIssue, JiraSearchResult } from '@lib/jira/client';
import type { SearchFn } from '@lib/jira/import-runner';
import { describe, expect, mock, test } from 'bun:test';

// The runner imports `server-only` (via the admin/env modules); shim it so the
// module graph loads under Bun, then import the testable core. We inject a fake
// Supabase + fake searchIssues, so the real admin client / Jira are never used.
void mock.module('server-only', () => ({}));
const { executeImport } = await import('@lib/jira/import-runner');

// --- Minimal in-memory Supabase double covering the runner's call patterns ---
interface Row { [k: string]: unknown }

class QB {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private lim: number | null = null;
  private payload: Row | Row[] | null = null;
  constructor(private store: Record<string, Row[]>, private table: string, private seq: { n: number }) {}
  select(): this { return this; }
  insert(rows: Row | Row[]): this { this.op = 'insert'; this.payload = rows; return this; }
  update(p: Row): this { this.op = 'update'; this.payload = p; return this; }
  delete(): this { this.op = 'delete'; return this; }
  eq(c: string, v: unknown): this { this.filters.push(r => r[c] === v); return this; }
  // `.is(col, null)` mirrors a DB NULL: a column absent on an inserted row (the
  // fake doesn't apply column defaults) reads as NULL, so match undefined too.
  is(c: string, v: unknown): this { this.filters.push(r => (v === null ? r[c] == null : r[c] === v)); return this; }
  in(c: string, vs: unknown[]): this { this.filters.push(r => vs.includes(r[c])); return this; }
  order(): this { return this; }
  limit(n: number): this { this.lim = n; return this; }
  private rows(): Row[] { return (this.store[this.table] ??= []); }
  private matched(): Row[] { return this.rows().filter(r => this.filters.every(f => f(r))); }
  private exec(): Row[] {
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const added = list.map(p => ({ id: `${this.table}-${++this.seq.n}`, ...p }));
      this.rows().push(...added);
      return added;
    }
    if (this.op === 'update') {
      const m = this.matched();
      m.forEach(r => Object.assign(r, this.payload));
      return m;
    }
    if (this.op === 'delete') {
      const keep = this.rows().filter(r => !this.filters.every(f => f(r)));
      this.store[this.table] = keep;
      return [];
    }
    const m = this.matched();
    return this.lim != null ? m.slice(0, this.lim) : m;
  }

  async maybeSingle(): Promise<{ data: Row | null, error: null }> { return Promise.resolve({ data: this.exec()[0] ?? null, error: null }); }
  async single(): Promise<{ data: Row | null, error: null }> { return Promise.resolve({ data: this.exec()[0] ?? null, error: null }); }
  async then<T>(res: (v: { data: Row[], error: null }) => T): Promise<T> { return Promise.resolve(res({ data: this.exec(), error: null })); }
}

function fakeSupabase(seed: Record<string, Row[]>) {
  const store: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const seq = { n: 0 };
  // eslint-disable-next-line ts/no-explicit-any
  return { from: (t: string) => new QB(store, t, seq) as any, _store: store };
}

function issue(key: string, component: string | null): JiraIssue {
  return {
    key,
    fields: {
      summary: `Summary ${key}`,
      description: null,
      components: component ? [{ name: component }] : [],
      issuetype: { name: 'Story' },
    },
  };
}

function onePage(issues: JiraIssue[]): JiraSearchResult {
  return { issues, nextPageToken: null, isLast: true };
}

const PROJECT = 'P1';
function queuedJob(id: string): Row {
  return { id, workspace_id: 'W1', project_id: PROJECT, jql: 'project = ACME', status: 'queued', next_page_token: null, imported_count: 0, created_count: 0, updated_count: 0, skipped_count: 0, errors: [], started_at: null, completed_at: null };
}

describe('executeImport', () => {
  test('creates stories, routes by component, auto-creates Inbox (AC1/3/4)', async () => {
    const db = fakeSupabase({
      import_jobs: [queuedJob('J1')],
      modules: [{ id: 'mod-auth', project_id: PROJECT, name: 'Auth', parent_module_id: null, position: 0, archived_at: null }],
      user_stories: [],
      acceptance_criteria: [],
    });
    const search: SearchFn = async () => onePage([issue('ACME-1', 'Auth'), issue('ACME-9', null)]);

    await executeImport(db as never, search, 'J1');

    const job = db._store.import_jobs[0];
    expect(job.status).toBe('completed');
    expect(job.created_count).toBe(2);
    expect(job.updated_count).toBe(0);
    expect(job.imported_count).toBe(2);
    const stories = db._store.user_stories;
    expect(stories).toHaveLength(2);
    const auth = stories.find(s => s.external_id === 'ACME-1');
    expect(auth?.module_id).toBe('mod-auth');
    // ACME-9 went to a freshly created Inbox module.
    const inbox = db._store.modules.find(m => m.name === 'Inbox');
    expect(inbox).toBeTruthy();
    expect(stories.find(s => s.external_id === 'ACME-9')?.module_id).toBe(inbox?.id);
  });

  test('re-running the same import is idempotent (AC2)', async () => {
    const db = fakeSupabase({
      import_jobs: [queuedJob('J1')],
      modules: [{ id: 'mod-auth', project_id: PROJECT, name: 'Auth', parent_module_id: null, position: 0, archived_at: null }],
      user_stories: [],
      acceptance_criteria: [],
    });
    const search: SearchFn = async () => onePage([issue('ACME-1', 'Auth'), issue('ACME-9', null)]);

    await executeImport(db as never, search, 'J1');
    // Second run: a new queued job, same JQL/issues.
    db._store.import_jobs.push(queuedJob('J2'));
    await executeImport(db as never, search, 'J2');

    const job2 = db._store.import_jobs.find(j => j.id === 'J2');
    expect(job2?.status).toBe('completed');
    expect(job2?.created_count).toBe(0);
    expect(job2?.updated_count).toBe(2);
    expect(db._store.user_stories).toHaveLength(2); // no duplicates
  });

  test('paginates across pages (AC5)', async () => {
    const db = fakeSupabase({ import_jobs: [queuedJob('J1')], modules: [], user_stories: [], acceptance_criteria: [] });
    let call = 0;
    const search: SearchFn = async () => {
      call += 1;
      return call === 1
        ? { issues: [issue('ACME-1', null)], nextPageToken: 't2', isLast: false }
        : { issues: [issue('ACME-2', null)], nextPageToken: null, isLast: true };
    };

    await executeImport(db as never, search, 'J1');

    expect(call).toBe(2);
    expect(db._store.import_jobs[0].status).toBe('completed');
    expect(db._store.import_jobs[0].imported_count).toBe(2);
  });

  test('invalid credentials fail the job (AC6)', async () => {
    const { JiraAuthError } = await import('@lib/jira/client');
    const db = fakeSupabase({ import_jobs: [queuedJob('J1')], modules: [], user_stories: [], acceptance_criteria: [] });
    const search: SearchFn = async () => { throw new JiraAuthError('bad creds'); };

    await executeImport(db as never, search, 'J1');

    const job = db._store.import_jobs[0];
    expect(job.status).toBe('failed');
    expect((job.errors as { code: string }[]).some(e => e.code === 'jira_unauthorized')).toBe(true);
  });

  test('a non-queued job is a no-op (claim guard)', async () => {
    const db = fakeSupabase({ import_jobs: [{ ...queuedJob('J1'), status: 'running' }], modules: [], user_stories: [], acceptance_criteria: [] });
    let called = false;
    const search: SearchFn = async () => { called = true; return onePage([]); };

    await executeImport(db as never, search, 'J1');

    expect(called).toBe(false); // never claimed -> never searched
    expect(db._store.import_jobs[0].status).toBe('running');
  });
});
