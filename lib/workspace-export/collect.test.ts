import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { collectWorkspaceExportEntities } from '@lib/workspace-export/collect';
import { describe, expect, it } from 'bun:test';

// BK-508 — AC-09 isolation guard (unit-level: a fake table store, not a live
// DB). Two workspaces' worth of rows are seeded; collecting workspace A must
// never surface a row scoped to workspace B's projects, proving the
// workspace_id -> project_id id-collection chain does not leak across tenants.

interface Row { id: string, [key: string]: unknown }

function fakeAdmin(tables: Record<string, Row[]>): SupabaseClient<Database> {
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const builder = {
      select: () => builder,
      eq: (col: string, value: string) => {
        rows = rows.filter(r => r[col] === value);
        return builder;
      },
      in: (col: string, values: string[]) => {
        rows = rows.filter(r => values.includes(r[col] as string));
        return builder;
      },
      then: (resolve: (result: { data: Row[], error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

describe('collectWorkspaceExportEntities — cross-workspace isolation (AC-09)', () => {
  it('never returns a project belonging to another workspace', async () => {
    const admin = fakeAdmin({
      projects: [
        { id: 'proj-a', workspace_id: 'ws-a' },
        { id: 'proj-b', workspace_id: 'ws-b' },
      ],
      modules: [],
      user_stories: [],
      acceptance_criteria: [],
      atcs: [],
      atc_steps: [],
      atc_assertions: [],
      atc_acceptance_criteria: [],
      tests: [],
      test_steps: [],
      runs: [],
      run_atcs: [],
      run_steps: [],
      bugs: [],
      activity_log: [],
      workspace_members: [],
    });

    const result = await collectWorkspaceExportEntities(admin, 'ws-a');

    expect(result.projects).toEqual([{ id: 'proj-a', workspace_id: 'ws-a' }]);
    expect(result.projects.some(p => (p as Row).workspace_id === 'ws-b')).toBe(false);
  });

  it('scopes modules through the workspace\'s own project ids only', async () => {
    const admin = fakeAdmin({
      projects: [
        { id: 'proj-a', workspace_id: 'ws-a' },
        { id: 'proj-b', workspace_id: 'ws-b' },
      ],
      modules: [
        { id: 'mod-a', project_id: 'proj-a' },
        { id: 'mod-b', project_id: 'proj-b' },
      ],
      user_stories: [],
      acceptance_criteria: [],
      atcs: [],
      atc_steps: [],
      atc_assertions: [],
      atc_acceptance_criteria: [],
      tests: [],
      test_steps: [],
      runs: [],
      run_atcs: [],
      run_steps: [],
      bugs: [],
      activity_log: [],
      workspace_members: [],
    });

    const result = await collectWorkspaceExportEntities(admin, 'ws-a');

    expect(result.modules).toEqual([{ id: 'mod-a', project_id: 'proj-a' }]);
  });
});
