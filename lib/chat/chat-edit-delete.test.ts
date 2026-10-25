import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-219 — edit/delete RPCs (migration 0105) through REAL signed-in sessions:
// ownership, the 15-minute window, moderation, body scrub, tombstone
// anonymity. Skipped without Supabase credentials. Shared-DB test: run in isolation.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeOrSkip = url && anonKey && serviceKey ? describe : describe.skip;

const PREFIX = `bk219-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function signedIn(email: string) {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) { throw new Error(`sign-in failed: ${error.message}`); }
  return client;
}

type Client = Awaited<ReturnType<typeof signedIn>>;
type Role = 'sara' | 'elena' | 'mateo' | 'viewer' | 'outsider';
const users: Record<Role, { id: string, email: string }> = {
  sara: { id: '', email: `${PREFIX}-sara@example.test` },
  elena: { id: '', email: `${PREFIX}-elena@example.test` },
  mateo: { id: '', email: `${PREFIX}-mateo@example.test` },
  viewer: { id: '', email: `${PREFIX}-viewer@example.test` },
  outsider: { id: '', email: `${PREFIX}-outsider@example.test` },
};
const clients = {} as Record<Role, Client>;
let workspaceId = '';
let channelId = '';

async function send(who: Role, body: string, ageMinutes = 0): Promise<string> {
  const { data, error } = await service()
    .from('chat_messages')
    .insert({
      channel_id: channelId,
      workspace_id: workspaceId,
      author_user_id: users[who].id,
      body,
      created_at: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) { throw new Error(`seed message: ${error?.message}`); }
  return data.id;
}

const edit = (who: Role, id: string, body: string) => clients[who].rpc('bunkai_chat_edit_message', { p_message_id: id, p_body: body });
const del = (who: Role, id: string) => clients[who].rpc('bunkai_chat_delete_message', { p_message_id: id });

describeOrSkip('BK-219 — chat edit / delete RPCs', () => {
  beforeAll(async () => {
    const admin = service();
    for (const key of Object.keys(users) as Role[]) {
      const { data, error } = await admin.auth.admin.createUser({ email: users[key].email, password: PASSWORD, email_confirm: true });
      if (error || !data.user) { throw new Error(`createUser ${key}: ${error?.message}`); }
      users[key].id = data.user.id;
    }
    const { data: ws, error: wsErr } = await admin
      .from('workspaces')
      .insert({ slug: PREFIX, name: PREFIX, owner_user_id: users.sara.id })
      .select('id')
      .single();
    if (wsErr || !ws) { throw new Error(`workspace: ${wsErr?.message}`); }
    workspaceId = ws.id;
    const { error: mErr } = await admin.from('workspace_members').insert([
      { workspace_id: workspaceId, user_id: users.sara.id, role: 'member', status: 'active' },
      { workspace_id: workspaceId, user_id: users.elena.id, role: 'member', status: 'active' },
      { workspace_id: workspaceId, user_id: users.mateo.id, role: 'admin', status: 'active' },
      { workspace_id: workspaceId, user_id: users.viewer.id, role: 'viewer', status: 'active' },
    ]);
    if (mErr) { throw new Error(`members: ${mErr.message}`); }
    const { data: ch } = await admin.from('chat_channels').select('id').eq('workspace_id', workspaceId).single();
    channelId = ch!.id;
    for (const key of Object.keys(users) as Role[]) { clients[key] = await signedIn(users[key].email); }
  }, 90_000);

  afterAll(async () => {
    const admin = service();
    if (workspaceId) { await admin.from('workspaces').delete().eq('id', workspaceId); }
    for (const u of Object.values(users)) {
      if (u.id) { await admin.auth.admin.deleteUser(u.id); }
    }
  }, 60_000);

  it('author edits inside the window; edited_at is set and others see the new text', async () => {
    const id = await send('sara', 'staging is grene', 2);
    const { data, error } = await edit('sara', id, '  staging is green ');
    expect(error).toBeNull();
    expect(data![0].body).toBe('staging is green');
    expect(data![0].edited_at).not.toBeNull();
    const { data: seen } = await clients.elena.from('chat_messages').select('body, edited_at').eq('id', id).single();
    expect(seen!.body).toBe('staging is green');
    expect(seen!.edited_at).not.toBeNull();
  });

  it('refuses an edit after 15 minutes', async () => {
    const id = await send('sara', 'old message', 16);
    expect((await edit('sara', id, 'too late')).error?.message).toBe('edit_window_closed');
  });

  it('refuses edits by other members, admins, viewers and outsiders', async () => {
    const id = await send('sara', 'mine');
    expect((await edit('elena', id, 'x')).error?.message).toBe('not_author');
    expect((await edit('mateo', id, 'x')).error?.message).toBe('not_author');
    expect((await edit('outsider', id, 'x')).error?.message).toBe('message_not_found');
  });

  it('rejects an empty edit and an edit of a deleted message', async () => {
    const id = await send('sara', 'to be deleted');
    expect((await edit('sara', id, '   ')).error?.message).toBe('invalid_body');
    expect((await del('sara', id)).error).toBeNull();
    expect((await edit('sara', id, 'zombie')).error?.message).toBe('message_deleted');
  });

  it('author delete scrubs the body; deleted original is unreadable by anyone', async () => {
    const id = await send('sara', 'wrong link http://internal');
    const { data, error } = await del('sara', id);
    expect(error).toBeNull();
    expect(data![0].body).toBe('');
    expect(data![0].deleted_at).not.toBeNull();
    const { data: seen } = await clients.viewer.from('chat_messages').select('body, deleted_at').eq('id', id).single();
    expect(seen).toEqual({ body: '', deleted_at: data![0].deleted_at });
  });

  it('author can delete after the edit window closed', async () => {
    const id = await send('sara', 'ancient', 60);
    expect((await del('sara', id)).error).toBeNull();
  });

  it('members and viewers cannot delete others; admin can, and the tombstone is identical', async () => {
    const a = await send('sara', 'secret A');
    expect((await del('elena', a)).error?.message).toBe('not_allowed');
    expect((await del('viewer', a)).error?.message).toBe('not_allowed');
    expect((await del('outsider', a)).error?.message).toBe('message_not_found');

    const b = await send('sara', 'password hunter2');
    const moderated = await del('mateo', b);
    expect(moderated.error).toBeNull();
    const own = await del('sara', a);
    const strip = (r: Record<string, unknown>) => ({ body: r.body, edited_at: r.edited_at, has_deleted_at: r.deleted_at !== null });
    expect(strip(moderated.data![0])).toEqual(strip(own.data![0]));
    const { data: cols } = await clients.sara.from('chat_messages').select('*').eq('id', b).single();
    expect(Object.keys(cols)).not.toContain('deleted_by');
  });

  it('delete is idempotent and keeps the original deleted_at', async () => {
    const id = await send('sara', 'twice');
    const first = await del('sara', id);
    const second = await del('mateo', id);
    expect(second.error).toBeNull();
    expect(second.data![0].deleted_at).toBe(first.data![0].deleted_at);
  });

  it('clients still cannot write chat_messages directly', async () => {
    const id = await send('sara', 'direct');
    const upd = await clients.sara.from('chat_messages').update({ body: 'hax' }).eq('id', id).select('id');
    expect(upd.data ?? []).toEqual([]);
  });
});
