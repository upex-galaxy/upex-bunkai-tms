import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

// BK-1169 — `bunkai_report_workspace_coverage` (0109) restates the per-AC
// rules of `bunkai_report_project_coverage` for a whole workspace. Two copies
// of one definition drift the moment a fix lands in only one of them (0108
// changed the per-project ATC ordering). This text guard runs without a
// database and fails when the latest definition of either function no longer
// shares the per-ATC ordering or the per-AC state ladder with the other; the
// behaviour itself is proven against the real database by
// workspace-coverage.test.ts.

const dir = new URL('../../supabase/migrations/', import.meta.url);

function latestBody(functionName: string): string {
  const create = `create or replace function public.${functionName}(`;
  const file = readdirSync(dir)
    .filter(name => /^\d{4}[a-z]?_.*\.sql$/.test(name))
    .sort()
    .filter(name => readFileSync(new URL(name, dir), 'utf8').includes(create))
    .at(-1);
  expect(file).toBeDefined();
  const code = readFileSync(new URL(file!, dir), 'utf8')
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  const start = code.indexOf(create);
  return code.slice(start, code.indexOf('\n$$;', start));
}

function normalized(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// From `order by ra.atc_id` to the end of the atc_real_status CTE.
function atcOrdering(body: string): string {
  const start = body.indexOf('order by ra.atc_id');
  expect(start).toBeGreaterThan(-1);
  return normalized(body.slice(start, body.indexOf('),', start)));
}

// The three-way per-AC `case ... end as state` of the ac_state CTE.
function acStateLadder(body: string): string {
  const cte = body.slice(body.indexOf('ac_state as ('));
  const start = cte.indexOf('case');
  expect(start).toBeGreaterThan(-1);
  return normalized(cte.slice(start, cte.indexOf('end as state', start)));
}

describe('workspace coverage definition stays in step with the per-project one', () => {
  const project = latestBody('bunkai_report_project_coverage');
  const workspace = latestBody('bunkai_report_workspace_coverage');

  it('picks each ATC\'s status with the same ordering', () => {
    expect(atcOrdering(workspace)).toBe(atcOrdering(project));
  });

  it('decides each acceptance criterion\'s state with the same ladder', () => {
    expect(acStateLadder(workspace)).toBe(acStateLadder(project));
  });

  it('keeps the non-disclosing actor bind and membership check', () => {
    expect(workspace).toContain('if auth.uid() is not null and auth.uid() <> p_actor_user_id then');
    expect(workspace).toContain('perform public.bunkai_assert_actor_can_read_workspace(p_actor_user_id, p_workspace_id);');
  });
});
