import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

// BK-1220 — guards the shape of migration 0108 in its text, the same way
// lib/notifications/inapp-suppression-migration.test.ts guards 0107. The
// behaviour itself (identical data, identical coverage state) is proven
// against the real database by coverage-repeated-atc.test.ts; this file keeps
// the atc_real_status ordering from regressing silently in a later
// restatement of bunkai_report_project_coverage, and it runs without a
// database. The ordering assertions read the LATEST migration that restates
// the function, so a later file that brings back the old ordering fails here.

const dir = new URL('../../supabase/migrations/', import.meta.url);
const CREATE = 'create or replace function public.bunkai_report_project_coverage(';
const sql0108 = readFileSync(new URL('0108_project_coverage_repeated_atc_tiebreak.sql', dir), 'utf8');
const sql0090 = readFileSync(new URL('0090_project_coverage_skipped_blocked_not_run.sql', dir), 'utf8');

// Migration files sort by name ('0084_' before '0084a_'), so the last match
// is the definition a fresh database ends up with.
const latestFile = readdirSync(dir)
  .filter(name => /^\d{4}[a-z]?_.*\.sql$/.test(name))
  .sort()
  .filter(name => readFileSync(new URL(name, dir), 'utf8').includes(CREATE))
  .at(-1);
const sqlLatest = latestFile ? readFileSync(new URL(latestFile, dir), 'utf8') : '';

function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .map(line => line.replace(/\s--.*$/, ''))
    .join('\n');
}

function functionBody(code: string): string {
  const start = code.indexOf(CREATE);
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
}

function cte(body: string, name: string): string {
  const start = body.indexOf(`${name} as (`);
  expect(start).toBeGreaterThan(-1);
  const end = body.indexOf('\n  ),', start);
  expect(end).toBeGreaterThan(start);
  return body.slice(start, end);
}

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const body0108 = functionBody(withoutComments(sql0108));
const body0090 = functionBody(withoutComments(sql0090));
const bodyLatest = functionBody(withoutComments(sqlLatest));
const realStatus = squash(cte(bodyLatest, 'atc_real_status'));

describe(`atc_real_status ordering in the latest restatement (${latestFile})`, () => {
  it('is 0108 or a later migration', () => {
    expect(latestFile).toBeDefined();
    expect(latestFile! >= '0108_').toBe(true);
  });

  it('orders by latest run, then executed occurrence first, then the unique (run_id, position) key', () => {
    expect(realStatus).toContain(
      'order by ra.atc_id, r.started_at desc, '
      + 'case when ra.status in (\'passed\', \'failed\') then 0 else 1 end, '
      + 'ra.run_id, ra.position',
    );
  });

  it('no longer breaks a tie on the random run_atcs.id', () => {
    expect(realStatus).not.toMatch(/ra\.id\b/);
  });

  it('keeps one row per ATC from run_atcs joined to runs', () => {
    expect(realStatus).toContain('select distinct on (ra.atc_id) ra.atc_id, ra.status');
    expect(realStatus).toContain('from public.run_atcs ra join public.runs r on r.id = ra.run_id');
    expect(realStatus).toContain('where ra.atc_id is not null');
  });

  it('uses the same executed allowlist as ac_state (passed, failed)', () => {
    const acState = squash(cte(bodyLatest, 'ac_state'));
    expect(acState).toContain('coalesce(ars.status, \'pending\') not in (\'passed\', \'failed\')');
  });
});

describe('0108 restates 0090 and changes only the atc_real_status ordering', () => {
  it('is byte-identical to 0090 outside atc_real_status', () => {
    const strip = (body: string) => {
      const start = body.indexOf('atc_real_status as (');
      const end = body.indexOf('\n  ),', start);
      return body.slice(0, start) + body.slice(end);
    };
    expect(strip(body0108)).toBe(strip(body0090));
  });

  it('keeps the signature, SECURITY DEFINER, the empty search_path and the step-0 actor bind', () => {
    expect(body0108).toContain('p_actor_user_id uuid,\n  p_project_id    uuid\n)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = \'\'');
    const bind = body0108.indexOf('if auth.uid() is not null and auth.uid() <> p_actor_user_id then');
    const firstRead = body0108.indexOf('from public.projects');
    expect(bind).toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(bind);
  });

  it('re-asserts the grants and never grants anon or qa_inspector_ro', () => {
    const code = withoutComments(sql0108);
    expect(code).toContain('revoke execute on function public.bunkai_report_project_coverage(uuid, uuid) from public, anon;');
    expect(code).toContain('grant execute on function public.bunkai_report_project_coverage(uuid, uuid) to authenticated, service_role;');
    expect(code).not.toMatch(/qa_inspector_ro/);
    expect(code).not.toMatch(/grant\s+execute on function public\.bunkai_report_project_coverage\([^)]*\) to [^;]*anon/);
  });
});
