import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

// BK-1217 — guards the shape of migration 0107 in its text, the same way
// lib/runs/attachment-migration-order.test.ts guards 0097. The behaviour
// itself (rows stored, hidden, digested once) is proven against the real
// database by the run/bug trigger, list and digest isolation suites; this file
// keeps the ordering and the RLS predicates from regressing silently in a
// later restatement of these functions, and it runs without a database.

const sql = readFileSync(new URL('../../supabase/migrations/0107_notification_inapp_suppression.sql', import.meta.url), 'utf8');

function withoutComments(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .map(line => line.replace(/\s--.*$/, ''))
    .join('\n');
}

const code = withoutComments(sql);

function functionBody(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
}

function policy(name: string): string {
  const start = code.indexOf(`create policy ${name}`);
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf(';', start);
  return code.slice(start, end);
}

describe('0107 schema', () => {
  it('adds both columns additively, with a visible default and no backfill', () => {
    expect(code).toMatch(/add column if not exists in_app_suppressed boolean not null default false/);
    expect(code).toMatch(/add column if not exists emailed_at timestamptz null/);
    expect(code).not.toMatch(/update public\.notifications/);
  });
});

describe('0107 preference helper', () => {
  const body = functionBody('bunkai_notification_channel_enabled');

  it('is SECURITY INVOKER with a pinned search_path', () => {
    expect(body).not.toMatch(/security definer/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(/stable/);
  });

  it('maps run.% and bug.% to their categories and defaults to enabled', () => {
    expect(body).toMatch(/select not exists/);
    expect(body).toMatch(/np\.enabled = false/);
    expect(body).toMatch(/when p_event_type like 'run\.%' then 'run_lifecycle'/);
    expect(body).toMatch(/when p_event_type like 'bug\.%' then 'bug_lifecycle'/);
  });

  it('is callable by service_role only, never by a client role', () => {
    const signature = 'public.bunkai_notification_channel_enabled(uuid, text, text)';
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(code).toContain(`revoke execute on function ${signature} from ${role};`);
    }
    expect(code).toContain(`grant  execute on function ${signature} to service_role;`);
    expect(code).not.toMatch(/grant\s+execute on function public\.bunkai_notification_channel_enabled\([^)]*\) to (anon|authenticated)/);
  });
});

describe('0107 producers check preferences before they insert', () => {
  it('bunkai_notify_run_event: cookie self-suppression, then the preference gate, then the insert', () => {
    const body = functionBody('bunkai_notify_run_event');
    const cookie = body.indexOf('(new.payload ->> \'via\') = \'cookie\'');
    const inApp = body.indexOf('bunkai_notification_channel_enabled(v_recipient, new.action, \'in_app\')');
    const email = body.indexOf('bunkai_notification_channel_enabled(v_recipient, new.action, \'email\')');
    const insert = body.indexOf('insert into public.notifications');
    expect(cookie).toBeGreaterThan(-1);
    expect(inApp).toBeGreaterThan(cookie);
    expect(email).toBeGreaterThan(inApp);
    expect(insert).toBeGreaterThan(email);
    expect(body.slice(email, insert)).toMatch(/return new;/);
    expect(body.slice(insert)).toMatch(/in_app_suppressed/);
    expect(body.slice(insert)).toMatch(/not v_in_app/);
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).not.toMatch(/\braise\b/);
  });

  it('bunkai_notify_bug_event: the per-recipient gate sits inside the loop, before the insert', () => {
    const body = functionBody('bunkai_notify_bug_event');
    const loop = body.indexOf('foreach v_recipient in array v_recipients');
    const inApp = body.indexOf('bunkai_notification_channel_enabled(v_recipient, new.action, \'in_app\')');
    const email = body.indexOf('bunkai_notification_channel_enabled(v_recipient, new.action, \'email\')');
    const insert = body.indexOf('insert into public.notifications');
    const endLoop = body.indexOf('end loop;');
    expect(loop).toBeGreaterThan(-1);
    expect(inApp).toBeGreaterThan(loop);
    expect(email).toBeGreaterThan(inApp);
    expect(insert).toBeGreaterThan(email);
    expect(endLoop).toBeGreaterThan(insert);
    expect(body.slice(email, insert)).toMatch(/continue;/);
    expect(body.slice(insert, endLoop)).toMatch(/not v_in_app/);
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).not.toMatch(/\braise\b/);
  });
});

describe('0107 RLS hides and freezes suppressed rows', () => {
  it('the SELECT policy keeps every 0053 predicate and adds not in_app_suppressed', () => {
    const text = policy('notifications_select_recipient_member_retained');
    expect(text).toMatch(/for select/);
    expect(text).toMatch(/recipient_user_id = auth\.uid\(\)/);
    expect(text).toMatch(/public\.bunkai_is_workspace_member\(workspace_id\)/);
    expect(text).toMatch(/created_at >= now\(\) - interval '90 days'/);
    expect(text).toMatch(/and not in_app_suppressed/);
  });

  it('the UPDATE policy adds not in_app_suppressed to both USING and WITH CHECK', () => {
    const text = policy('notifications_update_recipient_member');
    const using = text.slice(text.indexOf('using ('), text.indexOf('with check ('));
    const check = text.slice(text.indexOf('with check ('));
    expect(using).toMatch(/recipient_user_id = auth\.uid\(\)/);
    expect(using).toMatch(/and not in_app_suppressed/);
    expect(check).toMatch(/recipient_user_id = auth\.uid\(\)/);
    expect(check).toMatch(/and not in_app_suppressed/);
  });
});

describe('0107 digest candidates', () => {
  const body = functionBody('bunkai_notification_digest_candidates');

  it('digests an email-only row once, and keeps the BK-991 deleted-workspace guard', () => {
    expect(body).toMatch(/and \(not n\.in_app_suppressed or n\.emailed_at is null\)/);
    expect(body).toMatch(/w\.deleted_at is null/);
    expect(body).toMatch(/np\.channel = 'email'/);
  });

  it('stays service_role only', () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(code).toContain(`revoke execute on function public.bunkai_notification_digest_candidates() from ${role};`);
    }
    expect(code).toContain('grant  execute on function public.bunkai_notification_digest_candidates() to service_role;');
  });
});
