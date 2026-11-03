import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-1168 — `bunkai_update_module` (migration 0110) logs `module.renamed` only
// when the name or the path really changes. The Rename module form sends the
// unchanged name with every description edit; before 0110 each such save
// logged a false `module.renamed` whose old_path equalled new_path.
//
// Runs against the REAL database through a REAL authenticated session
// (QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD): the function reads auth.uid()
// for its role gate and its activity actor, so a service-role call cannot
// exercise it. The RPC args mirror what PATCH /api/v1/modules/{id} sends.
//
// BK-1590 — the same RPC (migration 0115) logs `module.description_updated`
// only when the Description really changes. The form re-sends the unchanged
// Description with every save, so a rename-only edit used to log a false
// description event next to `module.renamed`. A NULL and an empty string both
// mean "no Description" (the form sends NULL, a PAT client may send '').
//
// Fixture (service role, prefixed, torn down by the workspace cascade): one
// workspace with the QA identity as a member, one project, one root module.
// The teardown asserts that no workspace carrying the prefix survives.
// Env-gated: skips when the env is absent; a failed precondition THROWS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasFullEnv = Boolean(url && serviceKey && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasFullEnv ? describe : describe.skip;

const PREFIX = `bk1168-1590-module-events-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
}

let member: SupabaseClient<Database> | null = null;
let workspaceId: string | null = null;
let projectId: string | null = null;

async function createModule(name: string, path: string, description: string | null = 'before'): Promise<string> {
  const { data, error } = await service()
    .from('modules')
    .insert({ project_id: projectId!, path, name, description })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id;
}

async function moduleEvents(moduleId: string) {
  const { data, error } = await service()
    .from('activity_log')
    .select('action, payload')
    .eq('entity_type', 'module')
    .eq('entity_id', moduleId)
    .order('created_at', { ascending: true });
  if (error) { throw error; }
  return data;
}

describeOrSkip('BK-1168 / BK-1590 — module events are logged only on a real change', () => {
  beforeAll(async () => {
    const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.user) {
      throw new Error(`[update-module-activity] precondition not met — QA_E2E login failed (${signInError?.message ?? 'no user'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: qaUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    workspaceId = workspace.id;

    const { error: memberError } = await db
      .from('workspace_members')
      .upsert({ workspace_id: workspaceId, user_id: qaUserId, role: 'member', status: 'active' }, { onConflict: 'workspace_id,user_id' });
    if (memberError) { throw memberError; }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }
    projectId = project.id;
    member = client;
  });

  afterAll(async () => {
    if (workspaceId) {
      await service().from('workspaces').delete().eq('id', workspaceId);
    }
    await member?.auth.signOut();

    // Teardown proof: the cascade left nothing carrying this run's prefix.
    const { count, error } = await service()
      .from('workspaces')
      .select('id', { count: 'exact', head: true })
      .like('slug', `${PREFIX}%`);
    if (error) { throw error; }
    expect(count).toBe(0);
  });

  it('a description-only save (same name re-sent) logs description_updated and no rename', async () => {
    const moduleId = await createModule('Checkout', 'checkout');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'Checkout',
      p_new_slug: 'checkout',
      p_description: 'after',
      p_update_description: true,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events.map(e => e.action)).toEqual(['module.description_updated']);

    const { data: row } = await service().from('modules').select('name, path, description').eq('id', moduleId).single();
    expect(row).toEqual({ name: 'Checkout', path: 'checkout', description: 'after' });
  });

  it('a real rename still logs module.renamed with the old and new path', async () => {
    const moduleId = await createModule('Payments', 'payments');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'Billing',
      p_new_slug: 'billing',
      p_update_description: false,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events).toEqual([
      { action: 'module.renamed', payload: { name: 'Billing', old_path: 'payments', new_path: 'billing' } },
    ]);
  });

  it('a case-only rename is a real name change and logs module.renamed', async () => {
    const moduleId = await createModule('Search', 'search');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'SEARCH',
      p_new_slug: 'search',
      p_update_description: false,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events.map(e => e.action)).toEqual(['module.renamed']);
  });

  it('a rename plus a description edit logs both events', async () => {
    const moduleId = await createModule('Orders', 'orders');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'Purchases',
      p_new_slug: 'purchases',
      p_description: 'after',
      p_update_description: true,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events.map(e => e.action).sort()).toEqual(['module.description_updated', 'module.renamed']);
  });

  // BK-1590 — the Rename module form re-sends the stored Description with the
  // new name; that must record the rename and nothing else.
  it('a rename that re-sends the unchanged description logs only module.renamed', async () => {
    const moduleId = await createModule('Reports', 'reports');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'Analytics',
      p_new_slug: 'analytics',
      p_description: 'before',
      p_update_description: true,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events).toEqual([
      { action: 'module.renamed', payload: { name: 'Analytics', old_path: 'reports', new_path: 'analytics' } },
    ]);

    const { data: row } = await service().from('modules').select('name, path, description').eq('id', moduleId).single();
    expect(row).toEqual({ name: 'Analytics', path: 'analytics', description: 'before' });
  });

  it('a description-only save without a name logs one module.description_updated', async () => {
    const moduleId = await createModule('Settings', 'settings');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_description: 'after',
      p_update_description: true,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events).toEqual([{ action: 'module.description_updated', payload: {} }]);

    const { data: row } = await service().from('modules').select('description').eq('id', moduleId).single();
    expect(row?.description).toBe('after');
  });

  it('re-saving the same name and the same description logs nothing', async () => {
    const moduleId = await createModule('Inbox', 'inbox');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'Inbox',
      p_new_slug: 'inbox',
      p_description: 'before',
      p_update_description: true,
    });
    expect(error).toBeNull();

    expect(await moduleEvents(moduleId)).toEqual([]);
  });

  it('a different description is ignored, and nothing is logged, when p_update_description is false', async () => {
    const moduleId = await createModule('Imports', 'imports');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_description: 'other',
      p_update_description: false,
    });
    expect(error).toBeNull();

    expect(await moduleEvents(moduleId)).toEqual([]);
    const { data: row } = await service().from('modules').select('description').eq('id', moduleId).single();
    expect(row?.description).toBe('before');
  });

  it('clearing a populated description logs module.description_updated and stores NULL', async () => {
    const moduleId = await createModule('Archive', 'archive');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_update_description: true,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events).toEqual([{ action: 'module.description_updated', payload: {} }]);

    const { data: row } = await service().from('modules').select('description').eq('id', moduleId).single();
    expect(row?.description).toBeNull();
  });

  it('a rename that re-sends an empty description over a NULL one logs only module.renamed', async () => {
    const moduleId = await createModule('Drafts', 'drafts', null);
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'Notes',
      p_new_slug: 'notes',
      p_description: '',
      p_update_description: true,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events.map(e => e.action)).toEqual(['module.renamed']);
  });

  it('a rename that re-sends NULL over a stored empty description logs only module.renamed', async () => {
    const moduleId = await createModule('Labels', 'labels', '');
    const { error } = await member!.rpc('bunkai_update_module', {
      p_module_id: moduleId,
      p_name: 'Tags',
      p_new_slug: 'tags',
      p_update_description: true,
    });
    expect(error).toBeNull();

    const events = await moduleEvents(moduleId);
    expect(events.map(e => e.action)).toEqual(['module.renamed']);
  });
});
