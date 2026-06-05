import type { ImportJobError } from '@lib/types';
import type { Database, Json } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JiraIssue } from './client';
import { byteLength } from '@lib/markdown/format';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';
import { buildModulePath, nextPosition } from '@lib/modules/path';
import { createAdminClient } from '@lib/supabase/admin';
import { slugify } from '@lib/utils/slug';
import { adfToMarkdown } from './adf-to-markdown';
import { JiraAuthError, searchIssues } from './client';
import { extractAcceptanceCriteria } from './extract-acceptance-criteria';
import 'server-only';

// The Jira import worker (BK-17). Runs in the Vercel `after()` background slot via
// the service-role admin client (RLS bypassed; authorization was enforced at
// enqueue). It claims the job, pages through Jira by nextPageToken, and per issue:
// converts the ADF description to Markdown (truncating > 50 KB), extracts ACs,
// routes to a Module (component-name match or the auto-created Inbox), and
// idempotently upserts user_stories + acceptance_criteria keyed on external_id.
// Per-issue failures append to errors[]; a Jira auth failure fails the whole job.

type Admin = SupabaseClient<Database>;

const MAX_DESCRIPTION_BYTES = 50 * 1024;
const TRUNCATION_MARKER = '\n\n> _[Truncated on import — the original Jira description exceeded 50 KB.]_';
const PAGE_SIZE = 100;

interface IssueOutcome {
  created: boolean
}

export async function runImportJob(jobId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !job) {
    return;
  }
  if (job.status === 'completed' || job.status === 'failed') {
    return;
  }

  await supabase
    .from('import_jobs')
    .update({ status: 'running', started_at: job.started_at ?? new Date().toISOString() })
    .eq('id', jobId);

  let created = job.created_count;
  let updated = job.updated_count;
  let skipped = job.skipped_count;
  const errors: ImportJobError[] = Array.isArray(job.errors) ? [...(job.errors as unknown as ImportJobError[])] : [];

  // Preload the project's active modules (name -> id, case-insensitive). The
  // Inbox is created lazily on first unmatched issue.
  const moduleByName = await loadModules(supabase, job.project_id);
  const inbox = { id: moduleByName.get('inbox') ?? null };

  let pageToken: string | null = job.next_page_token;

  try {
    for (;;) {
      const page = await searchIssues({ jql: job.jql, pageToken, maxResults: PAGE_SIZE });

      for (const issue of page.issues) {
        try {
          const outcome = await importIssue(supabase, job.project_id, issue, moduleByName, inbox);
          if (outcome.created) {
            created += 1;
          }
          else {
            updated += 1;
          }
        }
        catch (issueError) {
          skipped += 1;
          errors.push({
            jira_key: issue.key,
            code: 'import_failed',
            message: issueError instanceof Error ? issueError.message : String(issueError),
          });
        }
      }

      pageToken = page.nextPageToken;
      await supabase
        .from('import_jobs')
        .update({
          imported_count: created + updated,
          created_count: created,
          updated_count: updated,
          skipped_count: skipped,
          errors: errors as unknown as Json,
          next_page_token: pageToken,
        })
        .eq('id', jobId);

      if (page.isLast) {
        break;
      }
    }

    await supabase
      .from('import_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), next_page_token: null })
      .eq('id', jobId);
  }
  catch (fatal) {
    const code = fatal instanceof JiraAuthError ? 'jira_unauthorized' : 'job_failed';
    errors.push({ code, message: fatal instanceof Error ? fatal.message : String(fatal) });
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), errors: errors as unknown as Json })
      .eq('id', jobId);
  }
}

// Map lower(name) -> module id for the project's active modules.
async function loadModules(supabase: Admin, projectId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('modules')
    .select('id, name')
    .eq('project_id', projectId)
    .is('archived_at', null);
  const map = new Map<string, string>();
  for (const m of data ?? []) {
    const key = m.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, m.id);
    }
  }
  return map;
}

// Resolve the target module: the first Jira component whose name matches a
// module name (case-insensitive), else the auto-created Inbox.
async function resolveModuleId(
  supabase: Admin,
  projectId: string,
  issue: JiraIssue,
  moduleByName: Map<string, string>,
  inbox: { id: string | null },
): Promise<string> {
  for (const component of issue.fields.components) {
    const hit = moduleByName.get(component.name.toLowerCase());
    if (hit) {
      return hit;
    }
  }
  return ensureInbox(supabase, projectId, moduleByName, inbox);
}

// Create (once) a root "Inbox" module for unmatched issues.
async function ensureInbox(
  supabase: Admin,
  projectId: string,
  moduleByName: Map<string, string>,
  inbox: { id: string | null },
): Promise<string> {
  if (inbox.id) {
    return inbox.id;
  }
  const { data: roots } = await supabase
    .from('modules')
    .select('position')
    .eq('project_id', projectId)
    .is('parent_module_id', null);
  const position = nextPosition((roots ?? []).map(r => r.position));
  const { data, error } = await supabase
    .from('modules')
    .insert({
      project_id: projectId,
      parent_module_id: null,
      path: buildModulePath('', slugify('Inbox')),
      name: 'Inbox',
      position,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Could not create the Inbox module: ${error?.message ?? 'unknown error'}`);
  }
  inbox.id = data.id;
  moduleByName.set('inbox', data.id);
  return data.id;
}

// Idempotent upsert of one Jira issue into a user story + its acceptance criteria.
async function importIssue(
  supabase: Admin,
  projectId: string,
  issue: JiraIssue,
  moduleByName: Map<string, string>,
  inbox: { id: string | null },
): Promise<IssueOutcome> {
  const externalId = issue.key.trim().toUpperCase();
  const markdown = adfToMarkdown(issue.fields.description);
  const criteria = extractAcceptanceCriteria(markdown);
  const description = sanitizeMarkdown(truncate(markdown));
  const title = (issue.fields.summary || externalId).slice(0, 200);

  // Existing active story for this external_id in the project?
  const { data: existing } = await supabase
    .from('user_stories')
    .select('id')
    .eq('project_id', projectId)
    .eq('external_id', externalId)
    .is('archived_at', null)
    .maybeSingle();

  let storyId: string;
  let created: boolean;
  if (existing) {
    // Update title/description only; leave module placement (a possible manual
    // move) and status untouched.
    await supabase
      .from('user_stories')
      .update({ title, description })
      .eq('id', existing.id);
    storyId = existing.id;
    created = false;
  }
  else {
    const moduleId = await resolveModuleId(supabase, projectId, issue, moduleByName, inbox);
    const { data, error } = await supabase
      .from('user_stories')
      .insert({ module_id: moduleId, project_id: projectId, title, description, external_id: externalId })
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`Could not create the story for ${externalId}: ${error?.message ?? 'unknown error'}`);
    }
    storyId = data.id;
    created = true;
  }

  await reconcileCriteria(supabase, storyId, criteria);
  return { created };
}

// Insert any extracted criteria whose lower(title) is not already present under
// the story (append at the tail). Existing criteria text is left untouched.
async function reconcileCriteria(supabase: Admin, storyId: string, criteria: string[]): Promise<void> {
  if (criteria.length === 0) {
    return;
  }
  const { data: existing } = await supabase
    .from('acceptance_criteria')
    .select('title, position')
    .eq('user_story_id', storyId)
    .is('archived_at', null);
  const seen = new Set((existing ?? []).map(c => c.title.trim().toLowerCase()));
  let position = (existing ?? []).reduce((max, c) => Math.max(max, c.position), 0);

  const rows: { user_story_id: string, title: string, position: number }[] = [];
  for (const raw of criteria) {
    const title = raw.trim().slice(0, 200);
    const key = title.toLowerCase();
    if (title.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    position += 1;
    rows.push({ user_story_id: storyId, title, position });
  }
  if (rows.length > 0) {
    await supabase.from('acceptance_criteria').insert(rows);
  }
}

function truncate(markdown: string): string {
  if (byteLength(markdown) <= MAX_DESCRIPTION_BYTES) {
    return markdown;
  }
  // Trim to a safe byte budget (leave room for the marker), then append it.
  let out = markdown;
  while (byteLength(out) > MAX_DESCRIPTION_BYTES - byteLength(TRUNCATION_MARKER)) {
    out = out.slice(0, Math.floor(out.length * 0.9));
  }
  return out + TRUNCATION_MARKER;
}
