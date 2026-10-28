import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

// BK-1233 — keeps the project layout on the paged tree loaders.
//
// A bare `.from('atcs')` in the layout is exactly how the workbench tree got
// capped at 1000 ATCs: PostgREST truncates an unranged read with HTTP 200 and
// no error. The tree's ATC, story and AC reads must go through
// `lib/projects/workbench-tree-query.ts`, which pages them to completion.
//
// Pure filesystem scan (same shape as lib/supabase/realtime-subscribe-guard.test.ts):
// no module imports, no credentials, always runs.

const REPO_ROOT = join(import.meta.dir, '..', '..');
const LAYOUT_PATH = 'app/(app)/projects/[projectSlug]/layout.tsx';
const GUARDED_TABLES = ['atcs', 'user_stories', 'acceptance_criteria'];
const REQUIRED_LOADERS = ['fetchTreeAtcs(', 'fetchTreeStories(', 'fetchTreeAcceptanceCriteria('];

// Comments may name the tables while explaining the bug; only code counts.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function directTreeReads(code: string): string[] {
  return GUARDED_TABLES.filter(table => new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`).test(code));
}

const layoutCode = stripComments(readFileSync(join(REPO_ROOT, LAYOUT_PATH), 'utf8'));

describe('workbench tree guard (BK-1233)', () => {
  it('the project layout reads atcs, user_stories and acceptance_criteria only through the paged loaders', () => {
    expect(directTreeReads(layoutCode)).toEqual([]);
  });

  it('the project layout calls every paged tree loader', () => {
    expect(REQUIRED_LOADERS.filter(loader => !layoutCode.includes(loader))).toEqual([]);
    expect(layoutCode).toContain('@lib/projects/workbench-tree-query');
  });

  it('flags the pre-fix direct reads (the detector is not vacuous)', () => {
    const preFix = `
      supabase.from('user_stories').select('*').in('module_id', moduleIds),
      supabase.from('atcs').select('*').eq('project_id', project.id).is('archived_at', null),
      await supabase.from( "acceptance_criteria" ).select('*')`;
    expect(directTreeReads(preFix)).toEqual(['atcs', 'user_stories', 'acceptance_criteria']);
    expect(directTreeReads('supabase.from("project_environments").select("id")')).toEqual([]);
  });
});
