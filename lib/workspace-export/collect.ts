import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// BK-508 — one query per entity, workspace-scoped. Entity list is the one
// ratified in the 2026-08-18 Tech Lead comment on the ticket: Projects,
// Modules, User Stories, Acceptance Criteria, ATCs + steps + assertions +
// acceptance-criteria links, Tests + their chain, Runs + run_atcs + run_steps,
// Bugs, Activity, memberships. Uses the admin client (bypasses RLS) — the
// route's own Owner check (assertExportAuthorized) is the authorization
// boundary, same as runImportJob's use of the admin client after enqueue-time
// authorization.

type Admin = SupabaseClient<Database>;

export interface WorkspaceExportEntities {
  projects: unknown[]
  modules: unknown[]
  user_stories: unknown[]
  acceptance_criteria: unknown[]
  atcs: unknown[]
  atc_steps: unknown[]
  atc_assertions: unknown[]
  atc_acceptance_criteria: unknown[]
  tests: unknown[]
  test_steps: unknown[]
  runs: unknown[]
  run_atcs: unknown[]
  run_steps: unknown[]
  bugs: unknown[]
  activity: unknown[]
  memberships: unknown[]
}

function ids(rows: { id: string }[]): string[] {
  return rows.map(r => r.id);
}

export async function collectWorkspaceExportEntities(admin: Admin, workspaceId: string): Promise<WorkspaceExportEntities> {
  const { data: projects, error: projectsError } = await admin.from('projects').select('*').eq('workspace_id', workspaceId);
  if (projectsError) {
    throw new Error(`Could not collect projects: ${projectsError.message}`);
  }
  const projectIds = ids(projects ?? []);

  const { data: modules, error: modulesError } = projectIds.length === 0
    ? { data: [], error: null }
    : await admin.from('modules').select('*').in('project_id', projectIds);
  if (modulesError) {
    throw new Error(`Could not collect modules: ${modulesError.message}`);
  }

  const { data: userStories, error: userStoriesError } = projectIds.length === 0
    ? { data: [], error: null }
    : await admin.from('user_stories').select('*').in('project_id', projectIds);
  if (userStoriesError) {
    throw new Error(`Could not collect user_stories: ${userStoriesError.message}`);
  }
  const userStoryIds = ids(userStories ?? []);

  const { data: acceptanceCriteria, error: acceptanceCriteriaError } = userStoryIds.length === 0
    ? { data: [], error: null }
    : await admin.from('acceptance_criteria').select('*').in('user_story_id', userStoryIds);
  if (acceptanceCriteriaError) {
    throw new Error(`Could not collect acceptance_criteria: ${acceptanceCriteriaError.message}`);
  }

  const { data: atcs, error: atcsError } = projectIds.length === 0
    ? { data: [], error: null }
    : await admin.from('atcs').select('*').in('project_id', projectIds);
  if (atcsError) {
    throw new Error(`Could not collect atcs: ${atcsError.message}`);
  }
  const atcIds = ids(atcs ?? []);

  const { data: atcSteps, error: atcStepsError } = atcIds.length === 0
    ? { data: [], error: null }
    : await admin.from('atc_steps').select('*').in('atc_id', atcIds);
  if (atcStepsError) {
    throw new Error(`Could not collect atc_steps: ${atcStepsError.message}`);
  }

  const { data: atcAssertions, error: atcAssertionsError } = atcIds.length === 0
    ? { data: [], error: null }
    : await admin.from('atc_assertions').select('*').in('atc_id', atcIds);
  if (atcAssertionsError) {
    throw new Error(`Could not collect atc_assertions: ${atcAssertionsError.message}`);
  }

  const { data: atcAcceptanceCriteria, error: atcAcceptanceCriteriaError } = atcIds.length === 0
    ? { data: [], error: null }
    : await admin.from('atc_acceptance_criteria').select('*').in('atc_id', atcIds);
  if (atcAcceptanceCriteriaError) {
    throw new Error(`Could not collect atc_acceptance_criteria: ${atcAcceptanceCriteriaError.message}`);
  }

  const { data: tests, error: testsError } = await admin.from('tests').select('*').eq('workspace_id', workspaceId);
  if (testsError) {
    throw new Error(`Could not collect tests: ${testsError.message}`);
  }
  const testIds = ids(tests ?? []);

  const { data: testSteps, error: testStepsError } = testIds.length === 0
    ? { data: [], error: null }
    : await admin.from('test_steps').select('*').in('test_id', testIds);
  if (testStepsError) {
    throw new Error(`Could not collect test_steps: ${testStepsError.message}`);
  }

  const { data: runs, error: runsError } = await admin.from('runs').select('*').eq('workspace_id', workspaceId);
  if (runsError) {
    throw new Error(`Could not collect runs: ${runsError.message}`);
  }
  const runIds = ids(runs ?? []);

  const { data: runAtcs, error: runAtcsError } = runIds.length === 0
    ? { data: [], error: null }
    : await admin.from('run_atcs').select('*').in('run_id', runIds);
  if (runAtcsError) {
    throw new Error(`Could not collect run_atcs: ${runAtcsError.message}`);
  }
  const runAtcIds = ids(runAtcs ?? []);

  const { data: runSteps, error: runStepsError } = runAtcIds.length === 0
    ? { data: [], error: null }
    : await admin.from('run_steps').select('*').in('run_atc_id', runAtcIds);
  if (runStepsError) {
    throw new Error(`Could not collect run_steps: ${runStepsError.message}`);
  }

  const { data: bugs, error: bugsError } = await admin.from('bugs').select('*').eq('workspace_id', workspaceId);
  if (bugsError) {
    throw new Error(`Could not collect bugs: ${bugsError.message}`);
  }

  const { data: activity, error: activityError } = await admin.from('activity_log').select('*').eq('workspace_id', workspaceId);
  if (activityError) {
    throw new Error(`Could not collect activity_log: ${activityError.message}`);
  }

  const { data: memberships, error: membershipsError } = await admin.from('workspace_members').select('*').eq('workspace_id', workspaceId);
  if (membershipsError) {
    throw new Error(`Could not collect workspace_members: ${membershipsError.message}`);
  }

  return {
    projects: projects ?? [],
    modules: modules ?? [],
    user_stories: userStories ?? [],
    acceptance_criteria: acceptanceCriteria ?? [],
    atcs: atcs ?? [],
    atc_steps: atcSteps ?? [],
    atc_assertions: atcAssertions ?? [],
    atc_acceptance_criteria: atcAcceptanceCriteria ?? [],
    tests: tests ?? [],
    test_steps: testSteps ?? [],
    runs: runs ?? [],
    run_atcs: runAtcs ?? [],
    run_steps: runSteps ?? [],
    bugs: bugs ?? [],
    activity: activity ?? [],
    memberships: memberships ?? [],
  };
}
