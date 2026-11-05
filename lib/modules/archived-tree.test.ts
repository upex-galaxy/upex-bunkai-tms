import type { ArchivedTreeAtc } from '@lib/projects/workbench-tree-query';
import type { AcceptanceCriterion, Module, UserStory } from '@lib/types';
import { describe, expect, it } from 'bun:test';
import { annotateArchive } from './archived-tree';

const AT = '2026-11-05T10:00:00.000Z';
const EARLIER = '2026-11-01T10:00:00.000Z';

function mod(id: string, parent: string | null, archivedAt: string | null, batch: string | null = null): Module {
  return {
    id,
    project_id: 'p',
    parent_module_id: parent,
    path: id,
    name: `Module ${id}`,
    position: 0,
    description: null,
    created_at: EARLIER,
    archived_at: archivedAt,
    archive_batch_id: batch,
  };
}

function story(id: string, moduleId: string, archivedAt: string | null, batch: string | null = null): UserStory {
  return {
    id,
    module_id: moduleId,
    project_id: 'p',
    title: `Story ${id}`,
    description: null,
    external_id: null,
    external_url: null,
    status: 'draft',
    created_at: EARLIER,
    archived_at: archivedAt,
    archive_batch_id: batch,
  };
}

function criterion(id: string, storyId: string, archivedAt: string | null, batch: string | null = null): AcceptanceCriterion {
  return {
    id,
    user_story_id: storyId,
    title: `Criterion ${id}`,
    description: null,
    position: 1,
    created_at: EARLIER,
    archived_at: archivedAt,
    archive_batch_id: batch,
  };
}

const ANA = { user_id: 'u1', email: 'ana@example.com' };
const actors = new Map([['top', ANA]]);

function archivedAtc(id: string, moduleId: string, storyId: string, archivedAt: string, batch: string | null, by: string | null): ArchivedTreeAtc {
  return {
    id,
    project_id: 'p',
    module_id: moduleId,
    user_story_id: storyId,
    slug: `x/${id}`,
    title: id,
    layer: 'UI',
    version: 1,
    status: 'unrun',
    tags: [],
    technique: null,
    priority: null,
    created_at: EARLIER,
    updated_at: EARLIER,
    archived_at: archivedAt,
    archived_by: by,
    archive_batch_id: batch,
  };
}

describe('annotateArchive for ATCs', () => {
  const base = {
    modules: [mod('top', null, AT, 'b1')],
    stories: [story('s1', 'top', AT, 'b1')],
    criteria: [],
    actorByModule: actors,
  };

  it('a swept ATC and one held by its parent read as gone with the Module', () => {
    const result = annotateArchive({
      ...base,
      atcs: [archivedAtc('swept', 'top', 's1', AT, 'b1', null), archivedAtc('held', 'top', 's1', AT, null, null)],
    });
    expect(result.atcs.get('swept')).toEqual({ archived_at: AT, archived_by: ANA, archived_with: 'Module top' });
    expect(result.atcs.get('held')).toEqual({ archived_at: AT, archived_by: ANA, archived_with: 'Module top' });
  });

  it('an ATC archived on its own shows its own actor', () => {
    const result = annotateArchive({
      ...base,
      atcs: [archivedAtc('own', 'top', 's1', EARLIER, null, 'u9')],
      emailByUser: new Map([['u9', 'cy@example.com']]),
    });
    expect(result.atcs.get('own')).toEqual({ archived_at: EARLIER, archived_by: { user_id: 'u9', email: 'cy@example.com' }, archived_with: null });
  });
});

describe('annotateArchive', () => {
  it('gives the top of an archive its actor, and everything swept up the same actor and its name', () => {
    const result = annotateArchive({
      modules: [mod('top', null, AT, 'b1'), mod('sub', 'top', AT, 'b1'), mod('deep', 'sub', AT, 'b1')],
      stories: [story('s1', 'deep', AT, 'b1')],
      criteria: [criterion('c1', 's1', AT, 'b1')],
      actorByModule: actors,
    });

    expect(result.modules.get('top')).toEqual({ archived_at: AT, archived_by: ANA, archived_with: null });
    expect(result.modules.get('deep')).toEqual({ archived_at: AT, archived_by: ANA, archived_with: 'Module top' });
    expect(result.stories.get('s1')).toEqual({ archived_at: AT, archived_by: ANA, archived_with: 'Module top' });
    expect(result.criteria.get('c1')).toEqual({ archived_at: AT, archived_by: ANA, archived_with: 'Module top' });
  });

  it('shows only the date for a Story archived on its own, and never invents an actor', () => {
    const result = annotateArchive({
      modules: [mod('top', null, AT, 'b1')],
      stories: [story('own', 'top', EARLIER)],
      criteria: [criterion('c1', 'own', EARLIER), criterion('c2', 'own', '2026-10-01T00:00:00.000Z')],
      actorByModule: actors,
    });

    expect(result.stories.get('own')).toEqual({ archived_at: EARLIER, archived_by: null, archived_with: null });
    expect(result.criteria.get('c1')).toEqual({ archived_at: EARLIER, archived_by: null, archived_with: 'Story own' });
    expect(result.criteria.get('c2')).toEqual({ archived_at: '2026-10-01T00:00:00.000Z', archived_by: null, archived_with: null });
  });

  it('treats a sub-Module archived on its own as the top of its own archive', () => {
    const own = new Map([['top', ANA], ['sub', { user_id: 'u2', email: 'bo@example.com' }]]);
    const result = annotateArchive({
      modules: [mod('top', null, AT, 'b1'), mod('sub', 'top', EARLIER, 'b0')],
      stories: [],
      criteria: [],
      actorByModule: own,
    });

    expect(result.modules.get('sub')).toEqual({ archived_at: EARLIER, archived_by: { user_id: 'u2', email: 'bo@example.com' }, archived_with: null });
  });

  it('keeps two archives that share one instant apart by their batch', () => {
    const result = annotateArchive({
      modules: [mod('top', null, AT, 'b1'), mod('sub', 'top', AT, 'b2')],
      stories: [],
      criteria: [],
      actorByModule: actors,
    });

    expect(result.modules.get('sub')?.archived_with).toBeNull();
  });

  it('reads rows archived before the batch id by their shared instant', () => {
    const result = annotateArchive({
      modules: [mod('top', null, AT), mod('sub', 'top', AT)],
      stories: [story('s1', 'sub', AT)],
      criteria: [],
      actorByModule: actors,
    });

    expect(result.modules.get('sub')?.archived_with).toBe('Module top');
    expect(result.stories.get('s1')?.archived_by).toEqual(ANA);
  });

  it('says nothing about a live row, and survives an archived Module under a missing parent', () => {
    const result = annotateArchive({
      modules: [mod('live', null, null), mod('orphan', 'gone', AT, 'b1')],
      stories: [story('s1', 'live', null)],
      criteria: [],
      actorByModule: new Map(),
    });

    expect(result.modules.has('live')).toBe(false);
    expect(result.stories.has('s1')).toBe(false);
    expect(result.modules.get('orphan')).toEqual({ archived_at: AT, archived_by: null, archived_with: null });
  });
});
