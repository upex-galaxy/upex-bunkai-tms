import type { WorkspaceExportEntities } from '@lib/workspace-export/collect';
import { buildWorkspaceExportArchive } from '@lib/workspace-export/build-archive';
import { describe, expect, it } from 'bun:test';
import { unzipSync } from 'fflate';

const EMPTY_ENTITIES: WorkspaceExportEntities = {
  projects: [],
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
  activity: [],
  memberships: [],
};

describe('buildWorkspaceExportArchive', () => {
  it('produces a structurally valid archive for an empty workspace (AC-16)', () => {
    const zip = buildWorkspaceExportArchive('ws-1', EMPTY_ENTITIES);
    const files = unzipSync(zip);

    expect(files['manifest.json']).toBeDefined();
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as { workspace_id: string, counts: Record<string, number> };
    expect(manifest.workspace_id).toBe('ws-1');
    expect(manifest.counts.projects).toBe(0);

    for (const entity of Object.keys(EMPTY_ENTITIES)) {
      const content = files[`${entity}.json`];
      expect(content).toBeDefined();
      expect(JSON.parse(new TextDecoder().decode(content))).toEqual([]);
    }
  });

  it('includes every collected record, one JSON file per entity', () => {
    const entities: WorkspaceExportEntities = { ...EMPTY_ENTITIES, projects: [{ id: 'p1', name: 'Project 1' }] };
    const zip = buildWorkspaceExportArchive('ws-1', entities);
    const files = unzipSync(zip);
    const projects = JSON.parse(new TextDecoder().decode(files['projects.json'])) as unknown[];
    expect(projects).toEqual([{ id: 'p1', name: 'Project 1' }]);
  });
});
