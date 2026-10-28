import type { ApiError } from '@lib/api/error-envelope';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';
import { deleteMessage, editMessage, fetchMessagesPage, fetchRoster, parseListParams, postMessage } from './response';

// BK-215 — chat routes. Thin withApiHandler wrappers; every branch lives in
// ./response.ts and is tested with a fake-chainable db (same convention as
// notifications/route.test.ts).

const WS = '11111111-1111-1111-1111-111111111111';
const CH = '22222222-2222-2222-2222-222222222222';
const U1 = '33333333-3333-3333-3333-333333333333';

function row(seq: number, author: string | null = U1) {
  return { id: `id-${seq}`, seq, channel_id: CH, workspace_id: WS, author_user_id: author, body: `m${seq}`, created_at: '2026-10-25T10:00:00Z' };
}

interface FakeOpts {
  channel?: { id: string } | null
  messages?: ReturnType<typeof row>[]
  role?: string | null
  insertError?: { code?: string, message: string } | null
  authors?: { user_id: string, email: string }[]
  roster?: { user_id: string, email: string, role: string }[]
  rosterError?: { code?: string, message: string } | null
  rpcError?: { message: string } | null
  rpcRow?: Record<string, unknown>
}

interface Rec { ops: string[], limit?: number, inserted?: unknown }

function fakeDb(opts: FakeOpts, rec: Rec = { ops: [] }): SupabaseClient<Database> {
  const messagesQuery = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.gt = (_c: string, v: number) => { rec.ops.push(`gt:${v}`); return q; };
    q.lt = (_c: string, v: number) => { rec.ops.push(`lt:${v}`); return q; };
    q.order = (_c: string, o: { ascending: boolean }) => { rec.ops.push(o.ascending ? 'asc' : 'desc'); return q; };
    q.limit = async (n: number) => {
      rec.limit = n;
      const asc = rec.ops.includes('asc');
      const all = [...(opts.messages ?? [])].sort((a, b) => (asc ? a.seq - b.seq : b.seq - a.seq));
      return Promise.resolve({ data: all.slice(0, n), error: null });
    };
    q.insert = (v: unknown) => {
      rec.inserted = v;
      return {
        select: () => ({
          single: async () => (opts.insertError
            ? { data: null, error: opts.insertError }
            : { data: row(99), error: null }),
        }),
      };
    };
    return q;
  };
  return {
    from: (table: string) => {
      if (table === 'chat_channels') {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = async () => ({ data: opts.channel === undefined ? { id: CH } : opts.channel, error: null });
        return q;
      }
      if (table === 'workspace_members') {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.maybeSingle = async () => ({ data: opts.role === null ? null : { role: opts.role ?? 'member' }, error: null });
        return q;
      }
      return messagesQuery();
    },
    rpc: async (fn: string) => {
      if (fn === 'bunkai_chat_resolve_authors') { return { data: opts.authors ?? [{ user_id: U1, email: 'elena.ruiz@x.io' }], error: null }; }
      if (fn === 'bunkai_chat_roster') { return { data: opts.roster ?? [], error: opts.rosterError ?? null }; }
      if (fn === 'bunkai_chat_edit_message' || fn === 'bunkai_chat_delete_message') {
        return opts.rpcError ? { data: null, error: opts.rpcError } : { data: [{ ...row(1), edited_at: null, deleted_at: null, ...opts.rpcRow }], error: null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  } as unknown as SupabaseClient<Database>;
}

async function code(p: Promise<unknown> | (() => unknown)): Promise<string | undefined> {
  try {
    await (typeof p === 'function' ? p() : p);
  }
  catch (e) {
    return (e as ApiError).code;
  }
  return undefined;
}

describe('parseListParams', () => {
  it('defaults and validates', () => {
    expect(parseListParams(WS, new URLSearchParams()).limit).toBe(30);
    expect(parseListParams(WS, new URLSearchParams('limit=5&before_seq=10')).beforeSeq).toBe(10);
  });
  it('rejects bad values and both cursors', async () => {
    expect(await code(() => parseListParams(WS, new URLSearchParams('limit=0')))).toBe('validation_failed');
    expect(await code(() => parseListParams(WS, new URLSearchParams('limit=101')))).toBe('validation_failed');
    expect(await code(() => parseListParams(WS, new URLSearchParams('before_seq=abc')))).toBe('validation_failed');
    expect(await code(() => parseListParams(WS, new URLSearchParams('before_seq=2&after_seq=1')))).toBe('validation_failed');
  });
});

describe('fetchMessagesPage', () => {
  it('returns the newest page ascending with has_more and author names', async () => {
    const messages = [row(1), row(2), row(3), row(4)];
    const page = await fetchMessagesPage(fakeDb({ messages }), { workspaceId: WS, limit: 3 });
    expect(page.items.map(m => m.seq)).toEqual([2, 3, 4]);
    expect(page.has_more).toBe(true);
    expect(page.items[0].author_name).toBe('Elena Ruiz');
  });
  it('has_more false on the last page and queries limit+1', async () => {
    const rec: Rec = { ops: [] };
    const page = await fetchMessagesPage(fakeDb({ messages: [row(1), row(2)] }, rec), { workspaceId: WS, limit: 5 });
    expect(page.has_more).toBe(false);
    expect(rec.limit).toBe(6);
  });
  it('before_seq pages older, after_seq catches up ascending', async () => {
    const rec: Rec = { ops: [] };
    await fetchMessagesPage(fakeDb({ messages: [row(1)] }, rec), { workspaceId: WS, limit: 5, beforeSeq: 7 });
    expect(rec.ops).toContain('lt:7');
    const rec2: Rec = { ops: [] };
    const page = await fetchMessagesPage(fakeDb({ messages: [row(5), row(6), row(7)] }, rec2), { workspaceId: WS, limit: 5, afterSeq: 4 });
    expect(rec2.ops).toContain('gt:4');
    expect(page.items.map(m => m.seq)).toEqual([5, 6, 7]);
  });
  it('404s when the channel is not visible (non-member)', async () => {
    expect(await code(fetchMessagesPage(fakeDb({ channel: null }), { workspaceId: WS, limit: 5 }))).toBe('not_found');
  });
  it('labels unknown authors as Former member', async () => {
    const page = await fetchMessagesPage(fakeDb({ messages: [row(1, null)] }), { workspaceId: WS, limit: 5 });
    expect(page.items[0].author_name).toBe('Former member');
  });
});

describe('postMessage', () => {
  it('inserts the trimmed body as the caller', async () => {
    const rec: Rec = { ops: [] };
    const item = await postMessage(fakeDb({}, rec), { workspaceId: WS, userId: U1, rawBody: '  hello  ' });
    expect(rec.inserted).toEqual({ channel_id: CH, workspace_id: WS, author_user_id: U1, body: 'hello' });
    expect(item.author_name).toBe('Elena Ruiz');
  });
  it('rejects empty and over-long bodies with 422', async () => {
    expect(await code(postMessage(fakeDb({}), { workspaceId: WS, userId: U1, rawBody: '   ' }))).toBe('validation_failed');
    expect(await code(postMessage(fakeDb({}), { workspaceId: WS, userId: U1, rawBody: 'x'.repeat(4001) }))).toBe('validation_failed');
  });
  it('forbids viewers before touching the table', async () => {
    const rec: Rec = { ops: [] };
    expect(await code(postMessage(fakeDb({ role: 'viewer' }, rec), { workspaceId: WS, userId: U1, rawBody: 'hi' }))).toBe('forbidden');
    expect(rec.inserted).toBeUndefined();
  });
  it('maps an RLS denial to forbidden and other errors to internal_error', async () => {
    expect(await code(postMessage(fakeDb({ insertError: { code: '42501', message: 'rls' } }), { workspaceId: WS, userId: U1, rawBody: 'hi' }))).toBe('forbidden');
    expect(await code(postMessage(fakeDb({ insertError: { message: 'boom' } }), { workspaceId: WS, userId: U1, rawBody: 'hi' }))).toBe('internal_error');
  });
  it('404s for a non-member (no visible channel)', async () => {
    expect(await code(postMessage(fakeDb({ channel: null }), { workspaceId: WS, userId: U1, rawBody: 'hi' }))).toBe('not_found');
  });
});

describe('editMessage / deleteMessage (BK-219)', () => {
  const MSG = '44444444-4444-4444-4444-444444444444';
  it('edits with the trimmed body and attaches the author', async () => {
    const item = await editMessage(fakeDb({ rpcRow: { body: 'fixed', edited_at: '2026-10-25T10:01:00Z' } }), { workspaceId: WS, messageId: MSG, rawBody: '  fixed ' });
    expect(item.body).toBe('fixed');
    expect(item.edited_at).toBe('2026-10-25T10:01:00Z');
    expect(item.author_name).toBe('Elena Ruiz');
  });
  it('rejects invalid bodies before calling the RPC', async () => {
    expect(await code(editMessage(fakeDb({ rpcError: { message: 'boom' } }), { workspaceId: WS, messageId: MSG, rawBody: '  ' }))).toBe('validation_failed');
  });
  it('maps RPC errors to the envelope', async () => {
    const run = async (m: string) => code(editMessage(fakeDb({ rpcError: { message: m } }), { workspaceId: WS, messageId: MSG, rawBody: 'x' }));
    expect(await run('message_not_found')).toBe('not_found');
    expect(await run('not_author')).toBe('forbidden');
    expect(await run('edit_window_closed')).toBe('forbidden');
    expect(await run('read_only')).toBe('forbidden');
    expect(await run('message_deleted')).toBe('conflict');
    expect(await run('weird')).toBe('internal_error');
  });
  it('deletes and returns the tombstone; foreign-workspace rows 404', async () => {
    const item = await deleteMessage(fakeDb({ rpcRow: { body: '', deleted_at: '2026-10-25T10:05:00Z' } }), { workspaceId: WS, messageId: MSG });
    expect(item.deleted_at).toBe('2026-10-25T10:05:00Z');
    expect(item.body).toBe('');
    expect(await code(deleteMessage(fakeDb({ rpcRow: { workspace_id: '99999999-9999-9999-9999-999999999999' } }), { workspaceId: WS, messageId: MSG }))).toBe('not_found');
    expect(await code(deleteMessage(fakeDb({ rpcError: { message: 'not_allowed' } }), { workspaceId: WS, messageId: MSG }))).toBe('forbidden');
  });
});

// BK-1282: the length rule counts code points (the DB's `char_length`), not
// UTF-16 units, on both create and edit. 4001 keeps the existing 422 shape.
describe('message length counts code points (BK-1282)', () => {
  const MSG = '44444444-4444-4444-4444-444444444444';
  const GRIN = '\u{1F600}';

  async function rejection(p: Promise<unknown>): Promise<{ code: string, message: string, details: unknown } | undefined> {
    try {
      await p;
    }
    catch (e) {
      const err = e as ApiError;
      return { code: err.code, message: err.message, details: err.details };
    }
    return undefined;
  }

  const TOO_LONG = {
    code: 'validation_failed',
    message: 'A message can be at most 4000 characters.',
    details: { reason: 'message_too_long' },
  };

  it('postMessage stores a 4000-emoji body and rejects 4001 with message_too_long', async () => {
    const rec: Rec = { ops: [] };
    await postMessage(fakeDb({}, rec), { workspaceId: WS, userId: U1, rawBody: ` ${GRIN.repeat(4000)}\n` });
    expect(rec.inserted).toEqual({ channel_id: CH, workspace_id: WS, author_user_id: U1, body: GRIN.repeat(4000) });

    const rejected: Rec = { ops: [] };
    expect(await rejection(postMessage(fakeDb({}, rejected), { workspaceId: WS, userId: U1, rawBody: GRIN.repeat(4001) }))).toEqual(TOO_LONG);
    expect(rejected.inserted).toBeUndefined();
  });

  it('editMessage accepts a 4000-emoji body and rejects 4001 before the RPC', async () => {
    const item = await editMessage(fakeDb({ rpcRow: { body: GRIN.repeat(4000) } }), { workspaceId: WS, messageId: MSG, rawBody: GRIN.repeat(4000) });
    expect(item.body).toBe(GRIN.repeat(4000));
    // An RPC error here would surface as internal_error: the 422 proves the
    // body was refused before the RPC ran.
    expect(await rejection(editMessage(fakeDb({ rpcError: { message: 'boom' } }), { workspaceId: WS, messageId: MSG, rawBody: GRIN.repeat(4001) }))).toEqual(TOO_LONG);
  });
});

describe('fetchRoster', () => {
  it('maps members with display names', async () => {
    const members = await fetchRoster(fakeDb({ roster: [{ user_id: U1, email: 'sara.lee@x.io', role: 'admin' }] }), WS);
    expect(members).toEqual([{ user_id: U1, email: 'sara.lee@x.io', display_name: 'Sara Lee', role: 'admin' }]);
  });
  it('maps 42501 to not_found', async () => {
    expect(await code(fetchRoster(fakeDb({ rosterError: { code: '42501', message: 'x' } }), WS))).toBe('not_found');
  });
});

describe('routes use the caller RLS client', () => {
  it('never import the admin client', () => {
    for (const f of ['messages/route.ts', 'messages/[messageId]/route.ts', 'roster/route.ts', 'response.ts']) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8')).not.toContain('createAdminClient');
    }
  });
});
