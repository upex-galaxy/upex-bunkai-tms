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
      if (entity === 'runs') {
        continue;
      }
      const content = files[`${entity}.json`];
      expect(content).toBeDefined();
      expect(JSON.parse(new TextDecoder().decode(content))).toEqual([]);
    }

    // BK-1025 — runs ship as NDJSON; zero runs is an empty (still valid) file.
    expect(files['runs.json']).toBeUndefined();
    expect(files['runs.ndjson']).toBeDefined();
    expect(new TextDecoder().decode(files['runs.ndjson'])).toBe('');
    expect(manifest.counts.runs).toBe(0);
  });

  it('includes every collected record, one JSON file per entity', () => {
    const entities: WorkspaceExportEntities = { ...EMPTY_ENTITIES, projects: [{ id: 'p1', name: 'Project 1' }] };
    const zip = buildWorkspaceExportArchive('ws-1', entities);
    const files = unzipSync(zip);
    const projects = JSON.parse(new TextDecoder().decode(files['projects.json'])) as unknown[];
    expect(projects).toEqual([{ id: 'p1', name: 'Project 1' }]);
  });
});

describe('buildWorkspaceExportArchive — Run snapshots as NDJSON (BK-1025, TC22)', () => {
  const runs = [
    { id: 'r1', status: 'passed', test_title: 'Checkout, happy path' },
    { id: 'r2', status: 'failed', test_title: 'Line\nbreak in a title' },
  ];
  const entities: WorkspaceExportEntities = {
    ...EMPTY_ENTITIES,
    runs,
    run_steps: [{ id: 's1', run_id: 'r1' }],
    projects: [{ id: 'p1', name: 'Project 1' }],
  };
  const files = unzipSync(buildWorkspaceExportArchive('ws-1', entities));
  const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

  it('writes runs.ndjson (and no runs.json): one JSON object per line, no enclosing array', () => {
    expect(files['runs.json']).toBeUndefined();
    const text = decode(files['runs.ndjson']);
    expect(text.startsWith('[')).toBe(false);
    expect(text.endsWith('\n')).toBe(true);
    const lines = text.split('\n').filter(line => line.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines.map(line => JSON.parse(line) as unknown)).toEqual(runs);
  });

  it('keeps every other entity, run_steps included, as a plain JSON array', () => {
    expect(JSON.parse(decode(files['run_steps.json']))).toEqual([{ id: 's1', run_id: 'r1' }]);
    expect(JSON.parse(decode(files['run_atcs.json']))).toEqual([]);
    expect(JSON.parse(decode(files['projects.json']))).toEqual([{ id: 'p1', name: 'Project 1' }]);
  });

  it('manifest counts the runs from the NDJSON file', () => {
    const manifest = JSON.parse(decode(files['manifest.json'])) as { counts: Record<string, number> };
    expect(manifest.counts.runs).toBe(2);
  });
});
