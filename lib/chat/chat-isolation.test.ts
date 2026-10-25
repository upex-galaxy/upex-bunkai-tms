import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-215 — RLS / RPC isolation for the workspace general channel (migration
// 0104), proven through REAL signed-in sessions (a service-role call would
// bypass every policy). Creates three throwaway users (member, viewer,
// outsider) and one workspace, removes them in afterAll. Skipped when Supabase
// credentials are absent. Shared-DB test: run it in isolation.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeOrSkip = url && anonKey && serviceKey ? describe : describe.skip;

const PREFIX = `bk215-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

const users: Record<'member' | 'viewer' | 'outsider', { id: string, email: string }> = {
  member: { id: '', email: `${PREFIX}-member@example.test` },
  viewer: { id: '', email: `${PREFIX}-viewer@example.test` },
  outsider: { id: '', email: `${PREFIX}-outsider@example.test` },
};
let workspaceId = '';
let channelId = '';
let member: Client;
let viewer: Client;
let outsider: Client;

describeOrSkip('BK-215 — workspace chat isolation (RLS + RPC)', () => {
  beforeAll(async () => {
    const admin = service();
    for (const key of Object.keys(users) as (keyof typeof users)[]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: users[key].email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) { throw new Error(`createUser ${key}: ${error?.message}`); }
      users[key].id = data.user.id;
    }
    const { data: ws, error: wsErr } = await admin
      .from('workspaces')
      .insert({ slug: PREFIX, name: PREFIX, owner_user_id: users.member.id })
      .select('id')
      .single();
    if (wsErr || !ws) { throw new Error(`workspace: ${wsErr?.message}`); }
    workspaceId = ws.id;
    const { error: mErr } = await admin.from('workspace_members').insert([
      { workspace_id: workspaceId, user_id: users.member.id, role: 'member', status: 'active' },
      { workspace_id: workspaceId, user_id: users.viewer.id, role: 'viewer', status: 'active' },
    ]);
    if (mErr) { throw new Error(`members: ${mErr.message}`); }
    member = await signedIn(users.member.email);
    viewer = await signedIn(users.viewer.email);
    outsider = await signedIn(users.outsider.email);
  }, 60_000);

  afterAll(async () => {
    const admin = service();
    if (workspaceId) { await admin.from('workspaces').delete().eq('id', workspaceId); }
    for (const u of Object.values(users)) {
      if (u.id) { await admin.auth.admin.deleteUser(u.id); }
    }
  }, 60_000);

  it('creates exactly one general channel with the workspace, visible to members only', async () => {
    const { data } = await member.from('chat_channels').select('id, kind').eq('workspace_id', workspaceId);
    expect(data?.length).toBe(1);
    expect(data![0].kind).toBe('general');
    channelId = data![0].id;
    const { data: hidden } = await outsider.from('chat_channels').select('id').eq('workspace_id', workspaceId);
    expect(hidden).toEqual([]);
  });

  it('lets a member send; viewer and outsider cannot', async () => {
    const ok = await member.from('chat_messages').insert({ channel_id: channelId, workspace_id: workspaceId, author_user_id: users.member.id, body: 'hello' });
    expect(ok.error).toBeNull();
    const asViewer = await viewer.from('chat_messages').insert({ channel_id: channelId, workspace_id: workspaceId, author_user_id: users.viewer.id, body: 'nope' });
    expect(asViewer.error).not.toBeNull();
    const asOutsider = await outsider.from('chat_messages').insert({ channel_id: channelId, workspace_id: workspaceId, author_user_id: users.outsider.id, body: 'nope' });
    expect(asOutsider.error).not.toBeNull();
  });

  it('cannot spoof another author', async () => {
    const { error } = await member.from('chat_messages').insert({ channel_id: channelId, workspace_id: workspaceId, author_user_id: users.viewer.id, body: 'spoof' });
    expect(error).not.toBeNull();
  });

  it('enforces the 1..4000 trimmed body bounds', async () => {
    const base = { channel_id: channelId, workspace_id: workspaceId, author_user_id: users.member.id };
    expect((await member.from('chat_messages').insert({ ...base, body: '   ' })).error).not.toBeNull();
    expect((await member.from('chat_messages').insert({ ...base, body: 'a'.repeat(4001) })).error).not.toBeNull();
    expect((await member.from('chat_messages').insert({ ...base, body: 'a'.repeat(4000) })).error).toBeNull();
  });

  it('viewer reads full history in seq order; outsider reads nothing', async () => {
    const { data } = await viewer.from('chat_messages').select('seq, body').eq('channel_id', channelId).order('seq', { ascending: true });
    expect(data!.length).toBeGreaterThanOrEqual(2);
    const seqs = data!.map(r => r.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    const { data: none } = await outsider.from('chat_messages').select('id').eq('channel_id', channelId);
    expect(none).toEqual([]);
  });

  it('messages are append-only for clients (no update, no delete)', async () => {
    const upd = await member.from('chat_messages').update({ body: 'edited' }).eq('channel_id', channelId).select('id');
    expect(upd.data ?? []).toEqual([]);
    const del = await member.from('chat_messages').delete().eq('channel_id', channelId).select('id');
    expect(del.data ?? []).toEqual([]);
    const { data } = await member.from('chat_messages').select('id').eq('channel_id', channelId);
    expect(data!.length).toBeGreaterThanOrEqual(2);
  });

  it('roster RPC lists active members with roles; refuses non-members', async () => {
    const { data, error } = await viewer.rpc('bunkai_chat_roster', { p_workspace_id: workspaceId });
    expect(error).toBeNull();
    const roles = Object.fromEntries(((data ?? []) as { user_id: string, role: string }[]).map(r => [r.user_id, r.role]));
    expect(roles[users.member.id]).toBe('member');
    expect(roles[users.viewer.id]).toBe('viewer');
    const denied = await outsider.rpc('bunkai_chat_roster', { p_workspace_id: workspaceId });
    expect(denied.error?.code).toBe('42501');
  });

  it('removing a member removes access to the channel and history', async () => {
    const admin = service();
    await admin.from('workspace_members').update({ status: 'suspended' }).eq('workspace_id', workspaceId).eq('user_id', users.viewer.id);
    const { data } = await viewer.from('chat_messages').select('id').eq('channel_id', channelId);
    expect(data).toEqual([]);
  });
});
