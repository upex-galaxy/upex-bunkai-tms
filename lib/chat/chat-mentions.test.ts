import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-217 — mentions, proven through REAL signed-in sessions against the shared
// database (migration 0123). Authorization contract of the RPCs follows
// ADR-0012-rpc-authorization-invariant: the actor is auth.uid(), forged or
// foreign mention ids are dropped, and a viewer cannot send. Creates throwaway
// users and two workspaces, removes them in afterAll. Skipped without Supabase
// credentials. Shared-DB test: run it in isolation.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeOrSkip = url && anonKey && serviceKey ? describe : describe.skip;

const PREFIX = `bk217-mention-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
type Key = 'sara' | 'elena' | 'noa' | 'mateo' | 'other';

const users: Record<Key, { id: string, email: string }> = {
  sara: { id: '', email: `${PREFIX}.sara@example.test` },
  elena: { id: '', email: `${PREFIX}.elena@example.test` },
  noa: { id: '', email: `${PREFIX}.noa@example.test` },
  mateo: { id: '', email: `${PREFIX}.mateo@example.test` },
  other: { id: '', email: `${PREFIX}.other@example.test` },
};
const clients = {} as Record<Key, Client>;
let ws = '';
let wsOther = '';

interface SentRow { id: string, mention_user_ids: string[], body: string, workspace_id: string }

async function send(as: Key, body: string, mentionIds: string[] | null = []): Promise<SentRow> {
  const { data, error } = await clients[as].rpc('bunkai_chat_send_message', { p_workspace_id: ws, p_body: body, p_mention_ids: mentionIds ?? undefined });
  if (error) { throw new Error(`send failed: ${error.message}`); }
  return (data as SentRow[])[0];
}

async function edit(as: Key, id: string, body: string, mentionIds?: string[]): Promise<SentRow> {
  const { data, error } = await clients[as].rpc('bunkai_chat_edit_message', { p_message_id: id, p_body: body, ...(mentionIds === undefined ? {} : { p_mention_ids: mentionIds }) });
  if (error) { throw new Error(`edit failed: ${error.message}`); }
  return (data as SentRow[])[0];
}

async function inboxFor(as: Key, messageId: string) {
  const { data, error } = await clients[as].from('notifications').select('id, event_type, entity_type, entity_id, payload, read_at').eq('entity_id', messageId);
  if (error) { throw new Error(`inbox read failed: ${error.message}`); }
  return data ?? [];
}

describeOrSkip('BK-217 — chat mentions (RPC + RLS)', () => {
  beforeAll(async () => {
    const admin = service();
    for (const key of Object.keys(users) as Key[]) {
      const { data, error } = await admin.auth.admin.createUser({ email: users[key].email, password: PASSWORD, email_confirm: true });
      if (error || !data.user) { throw new Error(`createUser ${key}: ${error?.message}`); }
      users[key].id = data.user.id;
    }
    const mk = async (slug: string, owner: Key) => {
      const { data, error } = await admin.from('workspaces').insert({ slug, name: slug, owner_user_id: users[owner].id }).select('id').single();
      if (error || !data) { throw new Error(`workspace ${slug}: ${error?.message}`); }
      return data.id;
    };
    ws = await mk(PREFIX, 'sara');
    wsOther = await mk(`${PREFIX}-b`, 'other');
    const { error: mErr } = await admin.from('workspace_members').insert([
      { workspace_id: ws, user_id: users.sara.id, role: 'member', status: 'active' },
      { workspace_id: ws, user_id: users.elena.id, role: 'member', status: 'active' },
      { workspace_id: ws, user_id: users.noa.id, role: 'viewer', status: 'active' },
      { workspace_id: ws, user_id: users.mateo.id, role: 'member', status: 'active' },
      { workspace_id: wsOther, user_id: users.other.id, role: 'member', status: 'active' },
    ]);
    if (mErr) { throw new Error(`members: ${mErr.message}`); }
    for (const key of Object.keys(users) as Key[]) { clients[key] = await signedIn(users[key].email); }
  }, 90_000);

  afterAll(async () => {
    const admin = service();
    const failures: string[] = [];
    for (const id of [ws, wsOther]) {
      if (!id) { continue; }
      const { error } = await admin.from('workspaces').delete().eq('id', id);
      if (error) { failures.push(`workspace ${id}: ${error.message}`); }
    }
    for (const u of Object.values(users)) {
      if (!u.id) { continue; }
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) { failures.push(`user ${u.email}: ${error.message}`); }
    }
    if (failures.length > 0) { throw new Error(`cleanup failed: ${failures.join('; ')}`); }
  }, 90_000);

  let messageId = '';

  it('stores one mention per member (duplicates collapse), drops forged and foreign ids, keeps the author pill', async () => {
    const forged = '00000000-0000-4000-8000-0000000000aa';
    const sent = await send(
      'sara',
      '  Hey @Elena and again @Elena, @Sara, @Other, rerun when ready  ',
      [users.elena.id, users.elena.id, users.sara.id, users.other.id, forged],
    );
    messageId = sent.id;
    expect(sent.body).toBe('Hey @Elena and again @Elena, @Sara, @Other, rerun when ready');
    expect([...sent.mention_user_ids].sort()).toEqual([users.elena.id, users.sara.id].sort());
  });

  it('gives the mentioned member exactly one inbox notification with channel, author and snippet', async () => {
    const rows = await inboxFor('elena', messageId);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('mentions');
    expect(rows[0].entity_type).toBe('chat_message');
    expect(rows[0].read_at).toBeNull();
    const payload = rows[0].payload as Record<string, string>;
    expect(payload.channel_name).toBe('general');
    expect(payload.author_user_id).toBe(users.sara.id);
    expect(payload.author_name.length).toBeGreaterThan(0);
    expect(payload.message_id).toBe(messageId);
    expect(payload.snippet).toContain('rerun when ready');
  });

  it('creates no self-notification and none for a foreign or forged id', async () => {
    expect(await inboxFor('sara', messageId)).toEqual([]);
    expect(await inboxFor('other', messageId)).toEqual([]);
    const { count } = await service().from('notifications').select('id', { count: 'exact', head: true }).eq('entity_id', messageId);
    expect(count).toBe(1);
  });

  it('lets the mentioned member read the mention rows; an outsider and a stranger cannot', async () => {
    const { data } = await clients.elena.from('chat_message_mentions').select('mentioned_user_id').eq('message_id', messageId);
    expect(data!.map(r => r.mentioned_user_id).sort()).toEqual([users.elena.id, users.sara.id].sort());
    const { data: hidden } = await clients.other.from('chat_message_mentions').select('mentioned_user_id').eq('message_id', messageId);
    expect(hidden).toEqual([]);
  });

  it('refuses client writes to mentions and the internal helper', async () => {
    const ins = await clients.sara.from('chat_message_mentions').insert({ message_id: messageId, workspace_id: ws, mentioned_user_id: users.noa.id });
    expect(ins.error).not.toBeNull();
    const del = await clients.sara.from('chat_message_mentions').delete().eq('message_id', messageId).select('message_id');
    expect(del.data ?? []).toEqual([]);
    const upd = await clients.sara.from('chat_message_mentions').update({ mentioned_user_id: users.noa.id }).eq('message_id', messageId).select('message_id');
    expect(upd.data ?? []).toEqual([]);
    const helper = await clients.sara.rpc('bunkai_chat_sync_mentions', { p_message_id: messageId, p_ids: [users.noa.id] });
    expect(helper.error).not.toBeNull();
    const { data } = await clients.sara.from('chat_message_mentions').select('mentioned_user_id').eq('message_id', messageId);
    expect(data).toHaveLength(2);
  });

  it('notifies a Viewer who is mentioned, and a Viewer cannot send', async () => {
    const sent = await send('sara', 'ping @Noa', [users.noa.id]);
    expect(sent.mention_user_ids).toEqual([users.noa.id]);
    expect(await inboxFor('noa', sent.id)).toHaveLength(1);
    const asViewer = await clients.noa.rpc('bunkai_chat_send_message', { p_workspace_id: ws, p_body: 'hello', p_mention_ids: [] });
    expect(asViewer.error?.message).toBe('read_only');
  });

  it('refuses a non-member and an invalid body', async () => {
    const outsider = await clients.other.rpc('bunkai_chat_send_message', { p_workspace_id: ws, p_body: 'hello', p_mention_ids: [] });
    expect(outsider.error?.message).toBe('workspace_not_found');
    const empty = await clients.sara.rpc('bunkai_chat_send_message', { p_workspace_id: ws, p_body: '   ', p_mention_ids: [] });
    expect(empty.error?.message).toBe('invalid_body');
    const long = await clients.sara.rpc('bunkai_chat_send_message', { p_workspace_id: ws, p_body: 'a'.repeat(4001), p_mention_ids: [] });
    expect(long.error?.message).toBe('invalid_body');
  });

  it('cuts the snippet at 140 characters and flattens line breaks', async () => {
    const body = `@Elena line one\nline two ${'x'.repeat(300)}`;
    const sent = await send('sara', body, [users.elena.id]);
    const [row] = await inboxFor('elena', sent.id);
    const snippet = (row.payload as { snippet: string }).snippet;
    expect(snippet).toHaveLength(140);
    expect(snippet.startsWith('@Elena line one line two ')).toBe(true);
    expect(snippet).not.toContain('\n');
  });

  it('on edit notifies only the newly added member; re-saving the same set notifies nobody', async () => {
    const sent = await send('sara', 'status @Elena', [users.elena.id]);
    expect(await inboxFor('elena', sent.id)).toHaveLength(1);
    const edited = await edit('sara', sent.id, 'status @Elena and @Mateo', [users.elena.id, users.mateo.id]);
    expect([...edited.mention_user_ids].sort()).toEqual([users.elena.id, users.mateo.id].sort());
    expect(await inboxFor('mateo', sent.id)).toHaveLength(1);
    expect(await inboxFor('elena', sent.id)).toHaveLength(1);
    await edit('sara', sent.id, 'status @Elena and @Mateo!', [users.elena.id, users.mateo.id]);
    expect(await inboxFor('mateo', sent.id)).toHaveLength(1);
    expect(await inboxFor('elena', sent.id)).toHaveLength(1);
  });

  it('removing a mention deletes its pill and keeps the past notification; omitting the set leaves mentions untouched', async () => {
    const sent = await send('sara', 'hello @Elena @Noa', [users.elena.id, users.noa.id]);
    const trimmed = await edit('sara', sent.id, 'hello @Noa', [users.noa.id]);
    expect(trimmed.mention_user_ids).toEqual([users.noa.id]);
    expect(await inboxFor('elena', sent.id)).toHaveLength(1);
    const untouched = await edit('sara', sent.id, 'hello @Noa again');
    expect(untouched.mention_user_ids).toEqual([users.noa.id]);
  });

  it('a member who left cannot be newly mentioned, but an edit that keeps their old mention keeps the pill', async () => {
    const sent = await send('sara', 'see @Mateo', [users.mateo.id]);
    expect(sent.mention_user_ids).toEqual([users.mateo.id]);
    const admin = service();
    await admin.from('workspace_members').update({ status: 'suspended' }).eq('workspace_id', ws).eq('user_id', users.mateo.id);
    const fresh = await send('sara', 'again @Mateo', [users.mateo.id]);
    expect(fresh.mention_user_ids).toEqual([]);
    expect(await inboxFor('elena', fresh.id)).toEqual([]);
    const kept = await edit('sara', sent.id, 'see @Mateo (cc @Elena)', [users.mateo.id, users.elena.id]);
    expect([...kept.mention_user_ids].sort()).toEqual([users.mateo.id, users.elena.id].sort());
    // Names still resolve for the pill of a member who left.
    const { data } = await clients.sara.rpc('bunkai_chat_resolve_authors', { p_workspace_id: ws, p_user_ids: [users.mateo.id] });
    expect((data as { user_id: string }[]).map(r => r.user_id)).toEqual([users.mateo.id]);
    await admin.from('workspace_members').update({ status: 'active' }).eq('workspace_id', ws).eq('user_id', users.mateo.id);
  });

  it('a mention forged through the edit RPC cannot reach a member of another workspace', async () => {
    const sent = await send('sara', 'forge attempt', []);
    const edited = await edit('sara', sent.id, 'forge attempt @Other', [users.other.id]);
    expect(edited.mention_user_ids).toEqual([]);
    expect(await inboxFor('other', sent.id)).toEqual([]);
  });

  it('only the author edits, and a deleted message clears its mentions but keeps past notifications', async () => {
    const sent = await send('sara', 'to delete @Elena', [users.elena.id]);
    const notStranger = await clients.elena.rpc('bunkai_chat_edit_message', { p_message_id: sent.id, p_body: 'hijack', p_mention_ids: [users.noa.id] });
    expect(notStranger.error?.message).toBe('not_author');
    const del = await clients.sara.rpc('bunkai_chat_delete_message', { p_message_id: sent.id });
    expect(del.error).toBeNull();
    const { data } = await clients.sara.from('chat_message_mentions').select('mentioned_user_id').eq('message_id', sent.id);
    expect(data).toEqual([]);
    expect(await inboxFor('elena', sent.id)).toHaveLength(1);
    const { data: list } = await clients.elena.rpc('bunkai_list_notifications', { p_workspace_id: ws });
    const item = (list as { items: { entity_id: string, entity_type: string, entity_available: boolean }[] }).items.find(i => i.entity_id === sent.id);
    // The tombstone row still exists, so the chat opens on it and says so.
    expect(item?.entity_type).toBe('chat_message');
    expect(item?.entity_available).toBe(true);
  });

  it('isolates inboxes between workspaces: another workspace member sees none of these notifications', async () => {
    const { data } = await clients.other.from('notifications').select('id').eq('workspace_id', ws);
    expect(data).toEqual([]);
  });
});
